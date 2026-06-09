import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VersionInfo } from '../../shared/types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_PATH = path.resolve(__dirname, '..', '..', 'package.json');

const REPO = 'zzusp/claude-code-session';
export const REPOSITORY_URL = `https://github.com/${REPO}`;
export const PACKAGE_NAME = '@zzusp/ccsm';
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — don't hammer GitHub on every page open
const FETCH_TIMEOUT_MS = 8000;

let cached: { at: number; info: VersionInfo } | null = null;

/** package.json `version` — the single source of truth, same as `ccsm --version`. */
export function getCurrentVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')) as { version?: string };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

interface ParsedVersion {
  nums: [number, number, number];
  /** Pre-release tag (everything after the first `-`); '' for a plain release. */
  pre: string;
}

function parseVersion(v: string): ParsedVersion {
  const clean = v.trim().replace(/^v/i, '');
  const dash = clean.indexOf('-');
  const core = dash < 0 ? clean : clean.slice(0, dash);
  const pre = dash < 0 ? '' : clean.slice(dash + 1);
  const parts = core.split('.').map((n) => parseInt(n, 10) || 0);
  return { nums: [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0], pre };
}

/** Minimal semver compare: returns >0 if a is newer than b, <0 if older, 0 if equal. */
export function compareSemver(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const [a0, a1, a2] = pa.nums;
  const [b0, b1, b2] = pb.nums;
  if (a0 !== b0) return a0 - b0;
  if (a1 !== b1) return a1 - b1;
  if (a2 !== b2) return a2 - b2;
  if (pa.pre === pb.pre) return 0;
  // A plain release outranks any pre-release of the same core (1.2.0 > 1.2.0-rc.1).
  if (pa.pre === '') return 1;
  if (pb.pre === '') return -1;
  return pa.pre < pb.pre ? -1 : 1;
}

interface GithubRelease {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  published_at?: string;
}

/**
 * VersionInfo for the UI. Cached for an hour; pass `force` to bypass.
 * A failed lookup is never cached — it degrades to current-version-only with
 * `checkError` set, so a later open retries.
 */
export async function getVersionInfo(force = false): Promise<VersionInfo> {
  const current = getCurrentVersion();
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { ...cached.info, current };
  }

  const info: VersionInfo = {
    current,
    latest: null,
    hasUpdate: false,
    releaseName: null,
    releaseNotes: null,
    releaseUrl: null,
    publishedAt: null,
    repositoryUrl: REPOSITORY_URL,
    checkError: null,
  };

  try {
    const res = await fetch(RELEASES_API, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': `ccsm/${current}`,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      info.checkError = `GitHub API ${res.status}`;
      return info;
    }
    const data = (await res.json()) as GithubRelease;
    const latest = (data.tag_name ?? '').trim().replace(/^v/i, '') || null;
    info.latest = latest;
    info.releaseName = data.name?.trim() || data.tag_name || null;
    info.releaseNotes = data.body ?? null;
    info.releaseUrl = data.html_url ?? null;
    info.publishedAt = data.published_at ?? null;
    info.hasUpdate = latest !== null && compareSemver(latest, current) > 0;
    cached = { at: Date.now(), info };
    return info;
  } catch (err) {
    info.checkError = (err as Error).message || 'version check failed';
    return info;
  }
}
