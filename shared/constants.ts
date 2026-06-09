export const RECENT_ACTIVITY_WINDOW_MIN = 5;
export const MAX_SESSION_MESSAGES = 5000;

// Claude Code writes this synthetic `user` record when the operator aborts a turn
// (Esc / Ctrl-C). It means the turn was *stopped*, not that Claude is still
// working — so the "working" heuristic treats a trailing interrupt as idle.
export const INTERRUPTED_MARKER_RE = /^\s*\[Request interrupted by user/;
