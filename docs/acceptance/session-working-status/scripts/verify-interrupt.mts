// Reverse-evidence guard for `parseJsonlMeta().lastTurnIncomplete`: classifies
// every session's last user/assistant record independently, then asserts the
// new flag matches expectation. Key case — `[Request interrupted by user]`
// (operator abort) must read as a FINISHED turn (incomplete=false), not working.
// Run from the repo root:
//   node --import tsx docs/acceptance/session-working-status/scripts/verify-interrupt.mts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { parseJsonlMeta } = await import(
  new URL('../../../../server/lib/parse-jsonl.ts', import.meta.url).href
);

const root = path.join(os.homedir(), '.claude', 'projects');
const files: string[] = [];
for (const p of fs.readdirSync(root)) {
  const dir = path.join(root, p);
  try {
    if (!fs.statSync(dir).isDirectory()) continue;
  } catch {
    continue;
  }
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.jsonl')) files.push(path.join(dir, f));
}

// Independent classification of the last user/assistant record (does not touch
// the production code path), used as the oracle.
function classify(fp: string): string {
  const lines = fs.readFileSync(fp, 'utf8').split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (!l) continue;
    let o: any;
    try {
      o = JSON.parse(l);
    } catch {
      continue;
    }
    if (o.type === 'user' || o.type === 'assistant') {
      const c = o.message?.content;
      if (o.type === 'assistant') {
        const types = Array.isArray(c) ? c.map((b: any) => b?.type) : [];
        return types[types.length - 1] === 'tool_use' ? 'assistant→tool_use' : 'assistant→done';
      }
      const tb = Array.isArray(c) ? c.find((b: any) => b?.type === 'text') : null;
      const txt = typeof c === 'string' ? c : tb?.text ?? '';
      if (/^\s*\[Request interrupted by user/.test(txt)) return 'user(interrupted)';
      const isTR = Array.isArray(c) && c.some((b: any) => b?.type === 'tool_result');
      return isTR ? 'user(tool_result)' : 'user(typed)';
    }
  }
  return '(none)';
}

const tally: Record<string, { incTrue: number; incFalse: number }> = {};
let mismatches = 0;
for (const fp of files) {
  const cls = classify(fp);
  const meta = await parseJsonlMeta(fp);
  tally[cls] ??= { incTrue: 0, incFalse: 0 };
  if (meta.lastTurnIncomplete) tally[cls].incTrue++;
  else tally[cls].incFalse++;
  const expected =
    cls === 'user(interrupted)' || cls === 'assistant→done' || cls === '(none)' ? false : true;
  if (meta.lastTurnIncomplete !== expected) {
    mismatches++;
    console.log(
      `MISMATCH ${path.basename(fp).slice(0, 8)} cls=${cls} incomplete=${meta.lastTurnIncomplete}`,
    );
  }
}
console.log('lastTurnIncomplete by last-record class:');
for (const [k, v] of Object.entries(tally).sort())
  console.log(`  ${k.padEnd(20)} incomplete=true:${v.incTrue}  false:${v.incFalse}`);
console.log(`\nmismatches vs expectation: ${mismatches}`);
