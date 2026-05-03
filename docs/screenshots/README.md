# Capturing screenshots

The repo doesn't ship screenshots — they go stale and bloat git history. Generate them locally when needed.

## Quickest path (macOS)

```bash
npm run dev   # starts both servers; open http://localhost:5173
```

Then for each page:

1. Resize the browser to a clean width (1280×800 works well, matches the `max-w-6xl` content area).
2. Hit **Cmd+Shift+5**, choose *Capture Selected Window*, click the browser window.
3. Save as the filename listed in the main `README.md` *Screenshots* section, into this directory.

## Pages worth capturing

| File | URL | What to show |
|---|---|---|
| `projects.png` | `/` | Project cards + totals header |
| `project-detail.png` | `/projects/<encoded-cwd>` | Session table with at least one row checked + visible status badges |
| `session-detail.png` | `/projects/<encoded-cwd>/sessions/<sid>` | Message timeline, search box with a typed query, a highlighted hit |
| `delete-dialog.png` | (open from project detail) | Confirmation dialog with both delete and skip groups |
| `disk-usage.png` | `/disk` | Pie + monthly bar + top-N table |

## Preparing demo data

If `~/.claude/` is empty, capture screenshots from a different machine that has actively used Claude Code, or use the test fixture pattern documented in `docs/spec/session-manager-design.md` § 7 (Verification → Delete smoke).

## Don't commit large screenshots

Keep each PNG under ~150 KB. Crop tightly. If you need to share a higher-res version, link to a gist or external host rather than committing it.
