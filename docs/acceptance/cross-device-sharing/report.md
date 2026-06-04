# Acceptance report — cross-device sharing (export / import)

**Status: ✅ all green** (Round 1). Design:
[`docs/spec/cross-device-sharing.md`](../../spec/cross-device-sharing.md).

## Summary

Export a project's memory + conversation history into a path-independent **bundle folder**, and
import it on another device where the project lives at a different absolute path. The structural
project root is replaced with a `${CLAUDE_PROJECT_ROOT}` sentinel on export and substituted with
the chosen local path on import — rewriting **two** fields: `cwd` in session `.jsonl` and
`project` in `history.jsonl`. Message bodies are left intact (archival record).

Import is the app's first file-creating write surface and reuses every delete guard:
under-`~/.claude/` validation, live/recently-active skip, per-file tmp→rename, and an atomic
`history.jsonl` append-with-dedup.

## Evidence

| Suite | Checks | Result |
|---|---|---|
| `scripts/verify-roundtrip.mjs` (HTTP) | 38 | ✅ ALL GREEN |
| `scripts/verify-ui.mjs` (Playwright, built SPA) | 9 | ✅ ALL GREEN |
| `npx tsc -b --force` | — | exit 0 |

Both suites run against an isolated backend (throwaway `HOME`/`USERPROFILE`); the real
`~/.claude` is untouched. Per-round detail + screenshots: [`round-1.md`](round-1.md).

## Covered

- Export sentinelization of `cwd` + `project`; content / `gitBranch` / `version` untouched;
  export refused inside `~/.claude/`.
- Cross-path import remap (both fields), `sessionId` preserved, memory + history merged.
- Idempotent re-import; overwrite-if-newer blocked by the 5-minute gate; keep-both id minting;
  same-device no-op.
- UI: Export dialog + Import page (preview → commit → open imported project).

## Not covered (intentional)

- **Full tier** (`file-history/`, `session-env/`, subdir) — out of scope by design (not
  path-portable).
- Real two-machine git push/pull — the bundle is a plain folder; transport is the user's
  choice and outside the app.
- Very large `.jsonl` performance — code streams line-by-line throughout; not load-tested.
