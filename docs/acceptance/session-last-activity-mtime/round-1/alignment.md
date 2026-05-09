# round-1 — session-last-activity-mtime alignment

Generated: 2026-05-09T13:53:53.622Z
Project: `D--project-claude-code-session`

Fix: `parse-jsonl.ts` / `load-session.ts` reconcile `lastAt` to `max(latest record ts, file mtime)`.

| sid | title | API lastAt | fs mtime | drift (ms) | live |
|---|---|---|---|---|---|
| `071dbad3` | fix-session-timestamp-mismatch | 2026-05-09T13:53:47.721Z | 2026-05-09T13:53:47.721Z | 0 | yes |
| `8e19e851` | align-session-titles | 2026-05-09T13:32:15.360Z | 2026-05-09T13:32:15.360Z | 0 |  |
| `575e9779` | Add browser tab favicon | 2026-05-08T15:24:11.868Z | 2026-05-08T15:24:11.868Z | 0 |  |
| `3fe89855` | windows环境下打开页面，显示“加载项目失败: 500 Internal Server Erro | 2026-05-08T14:18:22.044Z | 2026-05-08T14:18:22.044Z | 0 |  |
| `e6e5cbad` | Add delete button to session detail page | 2026-05-07T16:38:09.051Z | 2026-05-07T16:38:09.051Z | 0 |  |
