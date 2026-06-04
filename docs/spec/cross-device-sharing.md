# Cross-device sharing of project memory + conversation history

## Problem

The Session Manager was single-machine. Users want to move a project's **memory +
conversation history** to another device, where the *same logical project lives at a
different absolute path* (e.g. `D:\project\foo` on Windows vs `/home/me/foo` on Linux).

The crux is **path identity**: a `projectId` is just the encoded `cwd`
(`server/lib/encode-cwd.ts`), and the real path is recorded *inside* the data —

- session `.jsonl` lines carry it in their **`cwd`** field, and
- `history.jsonl` lines carry it in their **`project`** field (a *different* field name —
  verified against live data: keys are `display, pastedContents, timestamp, project,
  sessionId`).

Sharing therefore means producing a path-independent bundle on export and remapping
**those two fields** on import.

## Decisions

- **Transport — a portable folder.** Export writes a normalized folder; the user copies it
  (USB / cloud) or keeps it in a git repo and push/pulls. The app never embeds git or
  handles credentials — it just reads/writes a folder. This covers the export/import *and*
  the GitHub-repo idea with zero new dependencies. A central DB / sync server was rejected
  (heavy infra, contradicts the local single-user design).
- **Scope — core tier only.** `memory/*.md` + `MEMORY.md` + session `.jsonl` + matching
  `history.jsonl` lines — all path-portable after the sentinel swap. `file-history/`,
  `session-env/`, and the `<sid>/` subdir are excluded: they embed source-device absolute
  paths / env and aren't portable.
- **Delivery — a UI feature** with a mandatory dry-run preview before any write.
- **Server writes the folder directly** (POST endpoints with user-provided absolute paths),
  rather than streaming bytes through the browser's File System Access API. This fits the
  app's existing "server does all filesystem IO" model (cf. *Open folder*), is universal
  across browsers, and is directly testable. *(This is the one deviation from the initial
  plan, which sketched a `GET …/export` byte stream.)*

## Bundle format

```
<bundle>/
  manifest.json            # schemaVersion, kind, source {platform, cwd, projectId}, per-file sha256
  memory/
    MEMORY.md              # index, copied verbatim
    <name>.md              # entries, copied verbatim
  sessions/<sid>/
    conversation.jsonl     # copy of projects/<pid>/<sid>.jsonl, cwd     -> ${CLAUDE_PROJECT_ROOT}
    history.ndjson         # matching history.jsonl lines,        project -> ${CLAUDE_PROJECT_ROOT}
```

The sentinel `${CLAUDE_PROJECT_ROOT}` makes the bundle contain **no device-specific root**
(diffable in git, never depends on the lossy `decodeCwd`). `manifest.source.cwd` keeps the
original path for display + import suggestions only.

## Remap algorithm

The shared primitive is `rewriteLineField(raw, field, from, to)` in `server/lib/bundle.ts`:
parse a JSONL line, and **only if** the top-level `field` equals `from`, set it to `to` and
re-serialize; otherwise return the line byte-for-byte. So message bodies, `gitBranch`,
`version`, and lines lacking the field are never touched.

- **Export** streams each file line-by-line, rewriting `cwd` (conversation) / `project`
  (history) → sentinel, hashing the bytes written.
- **Import** picks a target cwd (suggestions: an existing local project with the same id, the
  original path if it resolves, or a same-basename project; else the user types one), computes
  `targetProjectId = encodeCwd(targetCwd)`, and rewrites sentinel → `targetCwd`. `keep-both`
  additionally rewrites the internal `sessionId` to a fresh UUID so the safety net / delete
  cascade stay consistent.

## Import safety (the new write surface)

Import is the app's first file-*creating* writer; it reuses every delete guard:

- Origin/CSRF check; `isSafeId(targetProjectId)` + `isSafeId(sessionId)`; every destination
  through `isUnderClaudeRoot`.
- **Never overwrites a live or recently-active (<5 min) session** (`buildActiveSessionMap` +
  mtime check). A live id is only importable via `keep-both` (fresh id).
- Per-file **tmp → rename** (no half-written files on a killed run; re-import is idempotent).
- `history.jsonl` merge = atomic backup → tmp → rename **append with de-dup**. The identity
  key is `(sessionId, timestamp, project, sha256(display))` — including `project` is what
  makes re-import to the *same* target a no-op while import to a *different* target is a
  genuinely new entry.
- Memory merge per-file: new → write; identical (sha256) → skip; conflict → keep local, write
  incoming as `<name>.imported-<hash>.md` (index conflict → `MEMORY.imported.md`).

Collision policy when a same-id session already exists: **skip** (default) /
**overwrite-if-newer** (by `lastAt`, still blocked by the live/recent gate) / **keep-both**.

## Surfaces

- `server/lib/{bundle,export-bundle,import-bundle}.ts`; `server/routes/import.ts`; export
  endpoint added to `server/routes/projects.ts`; mounted at `/api/import`.
- `POST /api/projects/:id/export`, `POST /api/import/preview` (dry run), `POST /api/import`.
- Wire types in `shared/types.ts` (`Bundle*`, `Import*`).
- Web: `ExportDialog` (Export button on `ProjectDetail`), `ImportPage` (`/import`, lazy),
  Sidebar nav entry; i18n keys for zh/en.

## Verification

Two isolated, automated suites under `docs/acceptance/cross-device-sharing/scripts/` — both
spawn a backend with a throwaway `HOME`/`USERPROFILE` so the real `~/.claude` is untouched:

- `verify-roundtrip.mjs` — HTTP round-trip: export sentinelization (and that content is
  *not* rewritten), cross-path remap of both fields, idempotent re-import, the recent-activity
  gate, keep-both id minting, same-device no-op. (38 checks)
- `verify-ui.mjs` — Playwright drives the real Export dialog + Import page against the built
  SPA. (9 checks)
