# Skip slash-command markup when deriving session titles

## Context

User reported (2026-05-09) that the session list at
`/projects/D--project-hiq-project` shows titles like
`<command-name>/clear</command-name> <command-message>clear</command-`
instead of the human-readable strings `claude resume` displays for the same
sessions.

Concrete sample (`claude resume` vs current UI):

| resume | sid | UI today |
|---|---|---|
| 查看这三个代码仓库中 zzusp 本周内的提交记录… | `b093dcb5` | `<command-name>/clear</command-name>…` ✗ |
| 我在思考，fast flow 中的 pr 提交是否应该提出来… | `926db1e5` | `<command-name>/model</command-name>…` ✗ |
| worktree-flow-scaffold | `ee017991` | worktree-flow-scaffold ✓ (customTitle) |
| 是否可以根据 "uat2-deploy-runbook.md" 文档… | `d0de2fcc` | 是否可以根据… ✓ |

## Root cause

Title derivation runs in two layers:

1. **Layer 1 — `aiTitle`** — fixed in
   [`session-title-ai-design.md`](session-title-ai-design.md). Only kicks in
   when the JSONL contains an `ai-title` record.
2. **Layer 2 — first non-meta user message** — the fallback. Untouched by
   the previous fix.

All 11 sessions under `D--project-hiq-project` have **`aiCount = 0`** (older
than the CLI release that started writing `ai-title`). Layer 1 falls
through, so titles come from Layer 2. `claude resume` also falls back to
Layer 2 in this case — so the right behaviour to mirror is its
"first user message" picker.

**The gap**: `claude resume`'s picker skips
`<command-name>...</command-args>` slash-command records when their args
are empty (`/clear`, `/model`, `/login`). Our picker doesn't.
`server/lib/system-tags.ts:6` only catches `<local-command-* | system-reminder | caveat>`;
the comment in that file deliberately excludes `<command-name>` because
`<command-args>` of non-empty slash invocations carries the user's real
prompt (e.g. `/init`, `/plan`, `/foo arg`). That intent is right — but
empty-args slash records carry no prompt and should be skipped anyway,
otherwise the title falls on raw XML wrapper text.

This limitation was already documented as a known issue in
[`docs/spec/session-scroll-edges-design.md:46`](session-scroll-edges-design.md)
and [`docs/acceptance/cross-session-search/round-1/auto-checks.md:107`](../acceptance/cross-session-search/round-1/auto-checks.md);
the previous round didn't tackle it.

### Collateral finding (drift from previous round)

`server/lib/load-session.ts` powers the **session detail page**
(`SessionMeta.title`). Its `captureMeta` (line 84) and `deriveAutoTitle`
(line 98) **don't read `ai-title`** — only `parseJsonlMeta` was updated in
the previous round. So today, list page and detail page disagree on title
when only `ai-title` exists; `shared/types.ts`'s updated comment on
`SessionMeta.title` ("latest ai-title…") is also untrue.

This round folds the lift-over so both code paths use identical resolution.

## Approach

One shared helper in `system-tags.ts`; both title-deriving call sites use
it. `aiTitle` is also captured in `load-session.ts` so detail page and list
page agree.

### Change 1 — `server/lib/system-tags.ts`

Add a sibling helper next to `SYSTEM_TAG_RE`:

```ts
/**
 * Slash-command records carry the user's actual prompt (if any) inside
 * `<command-args>BODY</command-args>`. Returns the trimmed args body when
 * meaningful; returns `''` when the record is just a metadata invocation
 * (`/clear`, `/model`, `/login` with empty args, or shapes that lack a
 * `<command-args>` tag entirely) so callers can skip the message. Returns
 * the input unchanged for non-slash-command text.
 *
 * Use this instead of treating raw user-message text as title-worthy —
 * `claude resume` applies the same skip when picking its picker labels.
 *
 * The detection regex covers four shapes observed in the wild
 * (sample = ~/.claude/projects survey, 37 sessions):
 *   1. `<command-name>X</command-name>…<command-args></command-args>`     ← empty
 *   2. `<command-name>X</command-name>…<command-args>BODY</command-args>` ← non-empty
 *   3. `<command-message>X</command-message>\n<command-name>/X</command-name>` (no args block)
 *   4. `<command-message>X</command-message>…<command-args>BODY</command-args>`
 * `<command-message>` can lead instead of `<command-name>` for some
 * legacy sessions, so the opener is `(?:name|message|args)`.
 */
export function pickTitleText(text: string): string {
  if (!/^\s*<command-(?:name|message|args)>/.test(text)) return text;
  const m = text.match(/<command-args>([\s\S]*?)<\/command-args>/);
  return (m?.[1] ?? '').trim();
}
```

`SYSTEM_TAG_RE` itself stays unchanged. Two reasons: (a) other call sites
(`load-session.buildMessage` for `isMeta`) still want
`<command-name>` blocks to render as user messages in the timeline, just
not be picked as title candidates; (b) the existing comment in
`system-tags.ts` correctly explains why slash records aren't system meta
in general — we're solving a narrower title-picking concern.

### Change 2 — `server/lib/parse-jsonl.ts`

In the `obj.type === 'user'` branch (around line 60–70), call
`pickTitleText` after the `SYSTEM_TAG_RE` skip and before assigning
`firstUserTitle`. Empty result → don't assign, loop continues to the next
user message.

```ts
if (!firstUserTitle && obj.type === 'user') {
  const msg = obj.message as { content?: unknown } | undefined;
  const candidate = extractUserText(msg?.content);
  if (candidate && !SYSTEM_TAG_RE.test(candidate)) {
    const usable = pickTitleText(candidate);
    if (usable) {
      firstUserTitle = usable.slice(0, 80).replace(/\s+/g, ' ').trim();
    }
  }
}
```

### Change 3 — `server/lib/load-session.ts`

Two edits:

1. **Capture `ai-title`** in `captureMeta` (around line 84). Add a sibling
   to the `custom-title` branch that overwrites a local `aiTitle`
   accumulator each time (latest wins, same as `parse-jsonl.ts`). The
   accumulator can live on a small extension object next to `meta` (or as
   a closure-scoped `let` in `loadSessionDetail`) — it doesn't need to
   leak to the wire.

2. **Use `aiTitle` first, then `deriveAutoTitle`** at line 80:
   ```ts
   meta.title = aiTitle || deriveAutoTitle(messages);
   ```

3. **Patch `deriveAutoTitle`** (lines 98–109) to apply `pickTitleText` on
   each candidate text and `continue` when empty, mirroring the
   `parse-jsonl.ts` change. Keep the `m.isMeta` skip and the first-line
   slice (`text.split('\n')[0]`).

### No other files need to change

- `shared/types.ts` — comments are already accurate after this round;
  Layer 1 (`aiTitle`) and Layer 2 (first non-slash, non-meta user
  message) wording stays.
- `web/*` — `s.customTitle ?? s.title` continues to work transparently.

## Files to modify

- `server/lib/system-tags.ts` — add `pickTitleText` helper.
- `server/lib/parse-jsonl.ts` — call `pickTitleText` in the user-message
  branch.
- `server/lib/load-session.ts` — capture `ai-title`, prefer it over
  `deriveAutoTitle`; thread `pickTitleText` through `deriveAutoTitle`.

## Verification

1. **Typecheck**: `npm run typecheck`. Must stay green.

2. **Playwright e2e**: extend
   `docs/acceptance/session-title-ai/scripts/verify-titles.mjs` (or add
   `scripts/verify-titles-slash-skip.mjs` in a sibling acceptance dir,
   `docs/acceptance/session-title-slash-skip/`) covering
   `D--project-hiq-project`:
   - `b093dcb5` → "查看这三个代码仓库中 zzusp 本周内的提交记录…"
   - `926db1e5` → "我在思考，fast flow 中的 pr 提交是否应该提出来…"
   - `7dfaf7cf` → `(untitled)` (session has only `/clear` + `/model` — no
     real prompt at all; this is the only "all empty" sample)
   - `ee017991` → still "worktree-flow-scaffold" (customTitle override
     unchanged — regression guard)

   Plus a regression check on the existing `D--project-claude-code-session`
   rows so the previous round still passes.

3. **Detail page spot-check** (manual): open one of the recovered
   sessions (e.g. `/projects/D--project-hiq-project/sessions/b093dcb5-…`)
   and confirm the page-header title matches the list row. Today they'd
   diverge for `ai-title`-only sessions.

## Out of scope

- Backfill: don't rewrite old JSONL files to inject `ai-title`. We just
  read what's there.
- Other slash-command edge cases: nested `<command-args>`, malformed
  records, multi-line args. The regex `<command-args>([\s\S]*?)<\/command-args>`
  is non-greedy and tolerates newlines; that's the only structural
  variation observed in the wild.
- Surfacing `aiTitle` separately on the wire (e.g. so Rename modal could
  show "AI suggested: …"). Still deferred — not requested.
