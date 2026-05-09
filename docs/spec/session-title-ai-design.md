# Align session list titles with `claude resume`

## Context

Web UI's session list at `/projects/:id` shows titles that don't match the
official `claude resume` picker. Concrete example reported by the user:

| `claude resume` | Web UI before fix |
|---|---|
| Add browser tab favicon | (raw first user prompt, e.g. "请帮我看一下 README.md…") |
| Add delete button to session detail page | (raw first user prompt) |
| windows环境下打开页面，显示"加载项目失败: 500 Internal Server Error" | matches (this one is `customTitle`) |

## Root cause

Claude Code CLI writes a record per turn into the session JSONL with the
shape:

```json
{"type":"ai-title","aiTitle":"Add browser tab favicon","sessionId":"…"}
```

`claude resume` displays this AI-generated title as the picker label. The
backend parser at `server/lib/parse-jsonl.ts` previously only knew two title
sources:

1. `custom-title` records — user-set via web Rename (precedence is correct).
2. The first non-system `user` message text, truncated to 80 chars.

`ai-title` records were silently skipped, so when the user had not renamed
the session, the UI showed the raw first user message instead of the AI
summary the CLI shows. Verified directly:

- `~/.claude/projects/D--project-claude-code-session/575e9779-….jsonl`
  contained 32 identical `ai-title` records with
  `aiTitle: "Add browser tab favicon"` — exactly the resume label.
- The "windows 环境下…" row matched because `custom-title` already wins;
  this was the only case where the original implementation was correct
  by accident.

Resolution priority that `claude resume` effectively uses:
**`customTitle` > latest `aiTitle` > first user message > `(untitled)`**.

## Approach

Surface `ai-title` inside `parseJsonlMeta()` only — the fix is one file and
no wire-shape changes are needed. `SessionSummary.title` already documents
itself as the auto-derived title (the user override lives on `customTitle`),
so swapping `aiTitle` in as a higher-priority auto source is in-spec.

### Change 1 — `server/lib/parse-jsonl.ts`

In the streaming loop:

- Add `let aiTitle: string | null = null;` next to the existing `customTitle`
  and `firstUserTitle` accumulators.
- When `obj.type === 'ai-title'` and `typeof obj.aiTitle === 'string'`,
  assign `aiTitle = obj.aiTitle`. **Always overwrite** so the *latest*
  AI-generated title wins — Claude regenerates this record every turn (the
  sample file has 32 copies; only the most recent is canonical).
- Rename the existing first-user-message local from `title` to
  `firstUserTitle` for clarity.
- Resolve final `title`:
  ```ts
  title: aiTitle || firstUserTitle || '(untitled)',
  ```
  Use `||` (not `??`) because `firstUserTitle` is initialized to `''`, not
  `null`. Do **not** truncate `aiTitle` — `claude resume` shows it at full
  length, and these are already short AI-generated summaries. CSS handles
  overflow in the table cell.

That's the entire functional change. `customTitle` resolution and the
returned shape are unchanged.

### Change 2 — `shared/types.ts`

Update two doc comments so future readers don't think the field is still
bound to user-message text:

- `SessionSummary.title` (~line 21).
- `SessionMeta.title` (~line 63).

Both now read: *"Auto-derived: latest `ai-title` record, falling back to
first user message."*

## No other files need to change

Verified consumers of `parseJsonlMeta`:

- `server/lib/scan.ts` — reads `meta.title`, passes through unchanged.
- `server/lib/search-all.ts` — same.
- `web/src/routes/ProjectDetail.tsx` — already does `s.customTitle ?? s.title`,
  so the new title flows through transparently.

## Files modified

- `server/lib/parse-jsonl.ts` — `ai-title` extraction + reworked title
  resolution.
- `shared/types.ts` — two doc-comment updates.

## Verification

1. **Typecheck**: `npm run typecheck` — covers both `tsconfig.server.json`
   and `tsconfig.web.json`. Must stay green.

2. **Playwright e2e** (per `feedback_ui_test_runner.md`: UI checks default
   to `.mjs` Playwright scripts, not user spot-check):
   `docs/acceptance/session-title-ai/scripts/verify-titles.mjs` visits
   `/projects/D--project-claude-code-session`, asserts the rows for
   `575e9779-…` ("Add browser tab favicon"), `e6e5cbad-…` ("Add delete
   button to session detail page"), and `3fe89855-…` (Chinese custom-title
   text). Round-1 screenshot captured under `docs/acceptance/session-title-ai/round-1/`.

## Out of scope

- Surfacing `aiTitle` as a separate field on `SessionSummary` (would let the
  Rename modal say "AI suggested: …"). Not requested; defer.
- Backfill / regeneration of titles for sessions that predate `ai-title`
  records — we just use whatever the file contains.
