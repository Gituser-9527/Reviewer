# 本地 Internal Alpha Smoke Harness

## 定位

`npm run alpha:local-smoke` 仅供维护人员在本机验证浏览器扩展的人工 `ASSIST` 流程。它不是自动 E2E、生产部署、Alpha Go 审批器或真人 Pilot 启动器。

Harness 复用仓库的本地 test PostgreSQL、migration、真实 API server、unpacked Manifest V3 扩展和 Playwright Chromium。它只打开仓库内带有 `LOCAL INTERNAL ALPHA SMOKE` 标识的脱敏 loopback 夹具；不会访问真实招聘网站、真实 Alpha 或生产环境。

## 前置条件

- Node.js 与 npm 已安装；
- Docker Desktop 可用，且本地 test PostgreSQL 端口可用；
- Playwright Chromium 已可启动；
- `TEST_DATABASE_URL` 仅指向 loopback test 数据库；
- 当前分支已包含所需构建文件。

不得把 Token、Authorization、Cookie、数据库 URL 或真实 tenant 值写入 shell 历史、截图、文档或反馈。

## 启动

```text
npm run alpha:local-smoke
```

Harness 自动完成本地 test PostgreSQL 启动、migration、packages/API/extension 构建、随机 loopback API 与 fixture 端口、临时 tenant 和短期开发凭据、动态 extension Origin 的精确 CORS 配置，以及 Chromium persistent context 启动。凭据不作为命令行参数传递；只在父进程、API 子进程和 extension Service Worker session storage 中短暂存在。

## 维护人员手动步骤

1. 在 Chromium 工具栏手动打开扩展 Popup。
2. 手动提取当前脱敏岗位并查看结果。
3. 人工修正至少一个允许修正字段。
4. 手动点击提交审核，查看 Finding 与 Evidence。
5. 手动高亮并手动清除高亮。
6. 使用夹具页面按钮手动触发岗位身份变化。
7. 确认旧结果为 `STALE`，提交和高亮被禁用。
8. 重新加载有效岗位，确认不会自动提取、自动审核或自动高亮。
9. 仅在完成后回到终端输入 `DONE`。

## PASS 条件

- 人工提取、修正、提交、Finding/Evidence 查看、高亮与清除均成功；
- `STALE` 安全保护生效；
- 不发生自动审核或自动高亮；
- 数据只进入本轮本地 test PostgreSQL；
- Harness cleanup 成功，并只生成 `.local/internal-alpha-smoke/` 下的脱敏会话摘要。

## FAIL / STOP 条件

立即停止并保留脱敏摘要：tenant 不匹配、CORS wildcard、Token 泄漏或进入 Content Script/MAIN world、自动操作、错误 tenant 写入、旧页面结果仍可提交、cleanup 失败、或出现非 loopback API/数据库/页面导航。

## 证据与限制

摘要只记录哈希 session、短提交 SHA、版本、计数、布尔匹配与 PASS/FAIL/NOT VERIFIED 门禁；不记录任何凭据、完整 ID、正文或 HTML。

本地 Smoke PASS 不代表真实 Alpha 环境 Ready、真人 Pilot 获批或公开生产可用。仍须单独验证 API Origin、环境隔离、tenant、凭据、Extension Origin/CORS、数据治理、维护人员真实审核和 Go/No-Go。
