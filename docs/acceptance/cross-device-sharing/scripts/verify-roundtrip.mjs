// Round-1 acceptance for cross-device sharing (export/import bundles).
//
// Spawns an ISOLATED backend with a throwaway HOME/USERPROFILE so the test
// never touches the real ~/.claude, seeds a synthetic project + session +
// memory + history line, then exercises the full HTTP surface:
//   export -> bundle on disk -> import (cross-path remap) -> idempotent re-import
//   -> collision gates (overwrite-if-newer recent block, keep-both).
//
// Usage:  node docs/acceptance/cross-device-sharing/scripts/verify-roundtrip.mjs
//
// Exit 0 = all green. Non-zero = a check failed (details on stdout).

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SENTINEL = '${CLAUDE_PROJECT_ROOT}';
const ORIGIN = 'http://127.0.0.1:5173';

let failures = 0;
function check(name, cond, detail = '') {
  const ok = !!cond;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures += 1;
}

function encodeCwd(cwd) {
  if (path.isAbsolute(cwd) && /^[A-Za-z]:[\\/]/.test(cwd)) {
    const drive = cwd[0].toUpperCase();
    const rest = cwd.slice(3).replace(/[\\/]/g, '-');
    return `${drive}--${rest}`;
  }
  return cwd.replace(/\//g, '-');
}

const isWin = process.platform === 'win32';
const SRC_CWD = isWin ? 'D:\\fake\\alpha' : '/fake/alpha';
const TARGET_CWD = isWin ? 'D:\\fake\\beta-here' : '/fake/beta-here';
const SRC_ID = encodeCwd(SRC_CWD);
const TARGET_ID = encodeCwd(TARGET_CWD);
const SID = '11111111-1111-4111-8111-111111111111';
const T0 = '2026-06-01T10:00:00.000Z';
const T1 = '2026-06-01T10:00:05.000Z';

function writeJsonl(file, objs) {
  fs.writeFileSync(file, objs.map((o) => JSON.stringify(o)).join('\n') + '\n', 'utf8');
}
function readJsonl(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

async function postJson(base, p, body) {
  const res = await fetch(base + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

function seed(home) {
  const claude = path.join(home, '.claude');
  const projDir = path.join(claude, 'projects', SRC_ID);
  const memDir = path.join(projDir, 'memory');
  fs.mkdirSync(memDir, { recursive: true });

  writeJsonl(path.join(projDir, `${SID}.jsonl`), [
    { type: 'file-history-snapshot', messageId: 'snap-1', snapshot: { trackedFileBackups: {} } },
    {
      parentUuid: null,
      uuid: 'u-1',
      type: 'user',
      cwd: SRC_CWD,
      sessionId: SID,
      version: '1.0.0',
      gitBranch: 'main',
      timestamp: T0,
      message: { role: 'user', content: `hello from alpha at ${SRC_CWD}` },
    },
    {
      parentUuid: 'u-1',
      uuid: 'a-1',
      type: 'assistant',
      cwd: SRC_CWD,
      sessionId: SID,
      timestamp: T1,
      message: { role: 'assistant', model: 'claude-test', content: [{ type: 'text', text: 'hi there' }] },
    },
  ]);

  fs.writeFileSync(path.join(memDir, 'MEMORY.md'), '# Memory index\n- [Build](build.md) — how\n', 'utf8');
  fs.writeFileSync(
    path.join(memDir, 'build.md'),
    '---\nname: Build\ndescription: how to build\ntype: project\n---\nRun npm build.\n',
    'utf8',
  );

  writeJsonl(path.join(claude, 'history.jsonl'), [
    { display: 'hello from alpha', pastedContents: {}, timestamp: T0, project: SRC_CWD, sessionId: SID },
  ]);

  return { claude };
}

function startServer(home) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['--import', 'tsx', 'server/index.ts'], {
      cwd: REPO,
      env: { ...process.env, USERPROFILE: home, HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let buf = '';
    const onData = (d) => {
      buf += d.toString();
      const m = buf.match(/listening on http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) {
        child.stdout.off('data', onData);
        resolve({ child, base: `http://127.0.0.1:${m[1]}` });
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => process.env.DEBUG && process.stderr.write(d));
    child.on('exit', (code) => reject(new Error(`server exited early (${code}): ${buf}`)));
    setTimeout(() => reject(new Error(`server did not start in time: ${buf}`)), 20000);
  });
}

async function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsm-share-'));
  const bundleDir = path.join(home, 'bundle');
  const { claude } = seed(home);

  const { child, base } = await startServer(home);
  try {
    // ── 1. export ────────────────────────────────────────────────────────────
    const exp = await postJson(base, `/api/projects/${encodeURIComponent(SRC_ID)}/export`, {
      sessionIds: 'all',
      destDir: bundleDir,
    });
    check('export returns 200', exp.status === 200, JSON.stringify(exp.json));
    check('export reports 1 session', exp.json?.sessionsExported === 1);
    check('export reports 2 memory files', exp.json?.memoryFilesExported === 2, `got ${exp.json?.memoryFilesExported}`);
    check('export reports 1 history line', exp.json?.historyLinesExported === 1);

    const manifest = JSON.parse(fs.readFileSync(path.join(bundleDir, 'manifest.json'), 'utf8'));
    check('manifest kind', manifest.kind === 'claude-session-bundle');
    check('manifest source.cwd is the real src cwd', manifest.source.cwd === SRC_CWD, manifest.source?.cwd);

    const convBundle = readJsonl(path.join(bundleDir, 'sessions', SID, 'conversation.jsonl'));
    const userLine = convBundle.find((o) => o.type === 'user');
    check('bundle: cwd replaced by sentinel', userLine.cwd === SENTINEL, userLine.cwd);
    check(
      'bundle: message CONTENT not rewritten (still has src path)',
      typeof userLine.message.content === 'string' && userLine.message.content.includes(SRC_CWD),
    );
    check('bundle: snapshot line passed through verbatim', convBundle.some((o) => o.type === 'file-history-snapshot'));

    const histBundle = readJsonl(path.join(bundleDir, 'sessions', SID, 'history.ndjson'));
    check('bundle history: project replaced by sentinel', histBundle[0].project === SENTINEL, histBundle[0].project);

    // ── 1b. export refuses to write under ~/.claude ───────────────────────────
    const evil = await postJson(base, `/api/projects/${encodeURIComponent(SRC_ID)}/export`, {
      sessionIds: 'all',
      destDir: path.join(claude, 'evil-bundle'),
    });
    check('export into ~/.claude is refused (400)', evil.status === 400, `status=${evil.status}`);

    // ── 2. cross-path import preview ──────────────────────────────────────────
    const prev = await postJson(base, '/api/import/preview', {
      bundleDir,
      targetCwd: TARGET_CWD,
      collisionPolicy: 'skip',
    });
    check('preview returns 200', prev.status === 200, JSON.stringify(prev.json));
    check('preview target id is encodeCwd(targetCwd)', prev.json?.remap?.targetProjectId === TARGET_ID, prev.json?.remap?.targetProjectId);
    check('preview: session action = create', prev.json?.sessions?.[0]?.action === 'create', prev.json?.sessions?.[0]?.action);
    check('preview: 1 history line to add', prev.json?.historyLinesToAdd === 1, `got ${prev.json?.historyLinesToAdd}`);
    check('preview: memory create x2', prev.json?.memory?.filter((m) => m.action === 'create').length === 2);

    // ── 3. cross-path import commit ───────────────────────────────────────────
    const imp = await postJson(base, '/api/import', {
      bundleDir,
      targetCwd: TARGET_CWD,
      collisionPolicy: 'skip',
    });
    check('import returns 200', imp.status === 200, JSON.stringify(imp.json));
    check('import: 1 session imported', imp.json?.imported?.length === 1);
    check('import: 1 history line added', imp.json?.historyLinesAdded === 1);
    check('import: 2 memory files written', imp.json?.memoryWritten?.length === 2);

    const importedJsonl = path.join(claude, 'projects', TARGET_ID, `${SID}.jsonl`);
    check('imported jsonl exists at target project', fs.existsSync(importedJsonl));
    const importedConv = readJsonl(importedJsonl);
    const impUser = importedConv.find((o) => o.type === 'user');
    check('imported: cwd remapped to targetCwd', impUser.cwd === TARGET_CWD, impUser.cwd);
    check('imported: sessionId unchanged', impUser.sessionId === SID);
    check(
      'imported: message content still references src path (archival)',
      impUser.message.content.includes(SRC_CWD),
    );

    const histAfter = readJsonl(path.join(claude, 'history.jsonl'));
    check('history: original src line preserved', histAfter.some((o) => o.project === SRC_CWD && o.sessionId === SID));
    check('history: remapped line appended with targetCwd', histAfter.some((o) => o.project === TARGET_CWD && o.sessionId === SID));

    check('imported memory MEMORY.md exists', fs.existsSync(path.join(claude, 'projects', TARGET_ID, 'memory', 'MEMORY.md')));
    check('imported memory build.md exists', fs.existsSync(path.join(claude, 'projects', TARGET_ID, 'memory', 'build.md')));

    // ── 4. idempotent re-import into the SAME target ──────────────────────────
    const re = await postJson(base, '/api/import', {
      bundleDir,
      targetCwd: TARGET_CWD,
      collisionPolicy: 'skip',
    });
    check('re-import: 0 sessions imported (skip already-present)', re.json?.imported?.length === 0, JSON.stringify(re.json?.imported));
    check('re-import: 0 history lines added (dedup)', re.json?.historyLinesAdded === 0, `got ${re.json?.historyLinesAdded}`);
    const histAfterRe = readJsonl(path.join(claude, 'history.jsonl'));
    check('re-import: history length unchanged (2)', histAfterRe.length === 2, `len=${histAfterRe.length}`);

    // ── 5. overwrite-if-newer is blocked by the recent-activity gate ──────────
    const ow = await postJson(base, '/api/import/preview', {
      bundleDir,
      targetCwd: TARGET_CWD,
      collisionPolicy: 'overwrite-if-newer',
    });
    const owAction = ow.json?.sessions?.[0];
    check(
      'overwrite-if-newer: recently-imported session is skipped',
      owAction?.action === 'skip' && /5 minutes/.test(owAction?.reason ?? ''),
      `${owAction?.action} / ${owAction?.reason}`,
    );

    // ── 6. keep-both mints a fresh session id and writes a second file ────────
    const kb = await postJson(base, '/api/import', {
      bundleDir,
      targetCwd: TARGET_CWD,
      collisionPolicy: 'keep-both',
    });
    const kbSession = kb.json?.imported?.[0];
    check('keep-both: action keep-both with new id', kbSession?.action === 'keep-both' && !!kbSession?.newSessionId, JSON.stringify(kbSession));
    if (kbSession?.newSessionId) {
      const kbFile = path.join(claude, 'projects', TARGET_ID, `${kbSession.newSessionId}.jsonl`);
      check('keep-both: new jsonl file written', fs.existsSync(kbFile));
      if (fs.existsSync(kbFile)) {
        const kbConv = readJsonl(kbFile);
        const kbUser = kbConv.find((o) => o.type === 'user');
        check('keep-both: internal sessionId rewritten to new id', kbUser.sessionId === kbSession.newSessionId, kbUser.sessionId);
        check('keep-both: cwd remapped to targetCwd', kbUser.cwd === TARGET_CWD);
      }
    }

    // ── 7. same-device import (targetCwd == sourceCwd) is a no-op ─────────────
    const same = await postJson(base, '/api/import', {
      bundleDir,
      targetCwd: SRC_CWD,
      collisionPolicy: 'skip',
    });
    check('same-device import: 0 sessions, 0 history lines', same.json?.imported?.length === 0 && same.json?.historyLinesAdded === 0, JSON.stringify(same.json));
  } finally {
    child.kill();
    try {
      fs.rmSync(home, { recursive: true, force: true });
    } catch {
      /* best effort; temp dir */
    }
  }

  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('verify crashed:', e);
  process.exit(2);
});
