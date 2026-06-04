import crypto from 'node:crypto';
import fs from 'node:fs';
import readline from 'node:readline';

/**
 * The literal placeholder that stands in for the project root inside a bundle.
 * Export replaces the device-specific absolute path with this; import swaps it
 * back to the local target path. Single-quoted on purpose — it is a literal
 * string, NOT a template interpolation.
 */
export const SENTINEL = '${CLAUDE_PROJECT_ROOT}';

/**
 * Rewrite a single top-level string field of a JSONL line, only when its value
 * exactly equals `fromValue`. Lines that don't carry the field (the fast path),
 * fail to parse, or hold a different value pass through byte-for-byte unchanged —
 * so message bodies and unrelated records are never touched. Re-serialization
 * via JSON.stringify changes key order/whitespace only, which is semantically
 * irrelevant to every consumer (Claude Code and this app both re-parse).
 */
export function rewriteLineField(
  raw: string,
  field: string,
  fromValue: string,
  toValue: string,
): string {
  if (!raw.includes(`"${field}"`)) return raw;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return raw;
  }
  if (obj[field] !== fromValue) return raw;
  obj[field] = toValue;
  return JSON.stringify(obj);
}

/**
 * Stream a JSONL/NDJSON file line-by-line, rewriting `field` from `fromValue` to
 * `toValue` where present, into `destPath`. Never slurps the whole file. Returns
 * the line count and the sha256 of the exact bytes written. Blank lines are
 * dropped (they carry no record).
 */
export async function transformFile(
  srcPath: string,
  destPath: string,
  field: string,
  fromValue: string,
  toValue: string,
): Promise<{ lines: number; sha256: string }> {
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(destPath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fs.createReadStream(srcPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let lines = 0;
  try {
    for await (const raw of rl) {
      if (!raw) continue;
      const chunk = rewriteLineField(raw, field, fromValue, toValue) + '\n';
      hash.update(chunk);
      out.write(chunk);
      lines += 1;
    }
    await new Promise<void>((resolve, reject) => {
      out.end((err?: Error | null) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    out.destroy();
    throw err;
  }

  return { lines, sha256: hash.digest('hex') };
}

export function sha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** sha256 of a file's raw bytes. For small files (memory entries); sync read. */
export function sha256File(p: string): string {
  return sha256(fs.readFileSync(p));
}
