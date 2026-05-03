// Matches text that is purely system-injected wrapper content — local command
// stdout/stderr replays, runtime system-reminder blocks, and caveat banners.
// Slash-command invocations (`<command-name>` / `<command-message>` /
// `<command-args>`) are user-driven and excluded — their `<command-args>` body
// carries the user's actual prompt.
export const SYSTEM_TAG_RE = /^\s*<(local-command|system-reminder|caveat)/i;
