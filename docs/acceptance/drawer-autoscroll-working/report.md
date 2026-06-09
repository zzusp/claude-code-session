# 验收报告 — 处理中新消息自动滚到底

全绿。

## 环境
- 生产构建 + `npm run start`（本地 127.0.0.1:3133），Playwright(chromium) headless 驱动。
- 接口全部 page.route() mock；会话详情接口 `lastAt=now`（保持 live）、最后一条为 assistant 的 tool_use（isWorking=true），按测试步骤增长消息数。

## 结果（4/4 PASS）

| 用例 | 断言 | 证据 |
|---|---|---|
| 时间线·停底跟随 | 停底 + 新消息到达 → window 跟到底 | distFromBottom=0px |
| 抽屉·打开落底 | 打开抽屉对话栏落在底部 | dist=0px（scrollHeight=3909） |
| 抽屉·停底跟随 | 停底 + 新消息到达 → 对话栏跟到底 | dist=0px |
| 抽屉·翻历史不打断 | scrollTop=0 读历史 + 新消息到达 → 不被拽回 | dist=4374px，scrollTop 仍为 0 |

```
PASS — timeline: 停在底部时新消息到达自动跟随 (distFromBottom=0px)
PASS — drawer: 打开时对话栏落在底部 (dist=0px sh=3909)
PASS — drawer: 停在底部时新消息到达自动跟随 (dist=0px)
PASS — drawer: 往上翻历史时新消息到达不打断（不拽回底部） (dist=4374px st=0)
==== 4/4 PASS ====
```

## 其它检查
- `npx tsc -p tsconfig.web.json --noEmit` → EXIT 0（web 端零类型错误）。
- `npm run build` → built 成功（EXIT 0）。
- 注：`npm run typecheck` 全量会报 server 测试文件 `Cannot find module 'vitest'`——本机 node_modules 未装全 devDeps（vitest 缺失），主仓同样如此，与本次改动无关。
