# e2e plan — cross-device sharing (export / import)

Design: [`docs/spec/cross-device-sharing.md`](../../spec/cross-device-sharing.md).

## Why these tests

The feature's substance is the **backend remap** (path-independence + safe writes into
`~/.claude/`). Because import *writes* into `~/.claude/`, tests must run against an **isolated**
store — never the developer's real `~/.claude`. Both scripts spawn `server/index.ts` with a
throwaway `HOME`/`USERPROFILE`, seed a synthetic project (1 session with `cwd`, a memory index
+ entry, one `history.jsonl` line), then exercise the HTTP / UI surface and tear everything
down.

## Scripts

| Script | Scope |
|---|---|
| `scripts/verify-roundtrip.mjs` | Full HTTP round-trip — the correctness proof. |
| `scripts/verify-ui.mjs` | Playwright drives the real Export dialog + Import page (built SPA). |

`verify-ui.mjs` requires `npm run build` first (single-process server serves `dist/`).

## Checks

**Export**
- 200 + correct counts; refuses a `destDir` under `~/.claude/` (400).
- Bundle `cwd` → sentinel and history `project` → sentinel.
- Message **content is NOT rewritten** (still references the source path) — archival fidelity.
- Non-`cwd` lines (e.g. `file-history-snapshot`) pass through verbatim.

**Import — cross-path remap**
- Preview: target id = `encodeCwd(targetCwd)`, session action `create`, 1 history line to add,
  memory `create` ×2.
- Commit: imported `.jsonl` has `cwd == targetCwd`, `sessionId` unchanged, content still
  references the source path; `history.jsonl` keeps the original line **and** gains a remapped
  one (`project == targetCwd`); memory files written.

**Safety / collisions**
- Idempotent re-import into the same target → 0 sessions, 0 history lines; history length stays 2.
- `overwrite-if-newer` on a just-imported (recent) session → skipped by the 5-minute gate.
- `keep-both` → fresh `newSessionId`, a second `.jsonl` whose internal `sessionId` is rewritten.
- Same-device import (`targetCwd == sourceCwd`) → no-op.

**UI**
- Export dialog opens from ProjectDetail, completes, writes the manifest.
- Import page loads a bundle, previews a `create` for a new target, commits, shows the result,
  and the imported session is reachable from the result link.
