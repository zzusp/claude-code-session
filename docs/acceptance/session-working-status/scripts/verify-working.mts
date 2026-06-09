// Ground-truth check for `SessionSummary.isWorking` against the real ~/.claude
// data on this machine. Run from the repo root:
//   node --import tsx docs/acceptance/session-working-status/scripts/verify-working.mts
//
// Prints every live-PID / working session so you can eyeball that "working"
// narrows "live" to sessions with an unfinished last turn + fresh activity.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { listSessionsForProject } = await import(
  new URL('../../../../server/lib/scan.ts', import.meta.url).href
);

const projectsRoot = path.join(os.homedir(), '.claude', 'projects');
const projectIds = fs
  .readdirSync(projectsRoot, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

let livePid = 0;
let working = 0;
const rows: string[] = [];
for (const pid of projectIds) {
  const sessions = await listSessionsForProject(pid);
  for (const s of sessions) {
    if (s.isLivePid || s.isWorking) {
      livePid += s.isLivePid ? 1 : 0;
      working += s.isWorking ? 1 : 0;
      const ageMin = s.lastAt
        ? ((Date.now() - new Date(s.lastAt).getTime()) / 60000).toFixed(1)
        : '?';
      rows.push(
        `  ${s.id.slice(0, 8)}  live=${String(s.isLivePid).padEnd(5)} recent=${String(
          s.isRecentlyActive,
        ).padEnd(5)} WORKING=${String(s.isWorking).padEnd(5)} age=${ageMin}min`,
      );
    }
  }
}
console.log(`live-pid sessions: ${livePid}   working sessions: ${working}\n`);
console.log(rows.join('\n'));
