// Matches text that is purely system-injected wrapper content — local command
// stdout/stderr replays, runtime system-reminder blocks, and caveat banners.
// Slash-command invocations (`<command-name>` / `<command-message>` /
// `<command-args>`) are user-driven and excluded — their `<command-args>` body
// carries the user's actual prompt.
export const SYSTEM_TAG_RE = /^\s*<(local-command|system-reminder|caveat)/i;

// Slash-command records carry the user's actual prompt (if any) inside
// <command-args>BODY</command-args>. Returns the trimmed args body when
// meaningful; returns '' when the record is just a metadata invocation
// (/clear, /model, /login with empty args, or legacy shapes that lack a
// <command-args> tag entirely) so callers can skip the message. Returns the
// input unchanged for non-slash-command text. `claude resume` applies the
// same skip when picking its picker labels — without it, titles for older
// sessions fall on raw XML wrapper text.
export function pickTitleText(text: string): string {
  if (!/^\s*<command-(?:name|message|args)>/.test(text)) return text;
  const m = text.match(/<command-args>([\s\S]*?)<\/command-args>/);
  return (m?.[1] ?? '').trim();
}
