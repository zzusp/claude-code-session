# Capturing screenshots

The committed PNGs in this folder are referenced by the main `README.md`. Use this recipe when you want to refresh them — keep filenames identical so the `<img>` tags in `README.md` keep working.

## Setup

```bash
npm run dev   # starts both servers
```

Open <http://localhost:5173>. Resize the browser to **1280×800** (matches the `max-w-6xl` content area, gives consistent crops across screenshots).

## Capture

| OS | How |
|---|---|
| **Windows** | `Win+Shift+S` → *Rectangle* → drag over the browser viewport → it copies to clipboard, then click the toast (or open *Snipping Tool*) → *Save As* → PNG |
| **macOS** | `Cmd+Shift+5` → *Capture Selected Window* → click the browser window |
| **Linux** | GNOME: `Shift+PrtScn` (area). KDE: Spectacle `PrtScn`. |

Save each PNG into **this directory** (`docs/screenshots/`) with the exact filename in the table below — the README's `<img src="…">` tags reference these paths verbatim.

## Pages to capture

The main `README.md` only embeds three screenshots — capture exactly these three filenames:

| File | URL | What to show |
|---|---|---|
| `project-detail.png` | `/projects/<encoded-cwd>` | Session table with at least one row checked, visible status badges (`live` / `idle`) |
| `session-detail.png` | `/projects/<encoded-cwd>/sessions/<sid>?q=...` | Timeline + search box with a typed query and a highlighted hit |
| `disk-usage.png` | `/disk` | Pie + monthly bar + top-N table all in one frame |

## Preparing demo data

If `~/.claude/` is empty on this machine, capture from a machine that has actually used Claude Code, or follow the test fixture pattern in `docs/spec/session-manager-design.md` § 7 (Verification → Delete smoke).

## Keep them small

- Aim for **≤ 150 KB per PNG**. Crop tightly — don't include the OS chrome / taskbar.
- If a high-res version is genuinely needed, link to a gist or external host instead of committing it.
- Light theme tends to compress better than dark; if both are interesting, capture light by default and keep dark variants out of git unless they show something light can't.
