# Extension local API PostgreSQL E2E

`npm run test:extension:e2e` 是快速浏览器回归：它使用真实 Chromium 扩展上下文和脱敏 Fixture，但 API 端是契约一致的本地 HTTP 服务。

`npm run test:extension:local-api:postgres` 是独立的真实集成验收。它会：

1. 启动独立 Docker 测试 PostgreSQL、等待就绪并执行迁移；
2. 构建 packages、API 和 Manifest V3 扩展；
3. 由真实 Chromium 加载 unpacked 扩展并从 Service Worker URL 动态获取扩展 ID；
4. 以该精确 `chrome-extension://<id>` Origin 启动正式本地 API；
5. 为单次运行生成仅存在于进程与 `chrome.storage.session` 的本地扩展 Bearer Token；
6. 经 Popup、Content Script 和 Preview 提交真实 `POST /api/audit/job`；
7. 从 PostgreSQL 和正式 `GET /api/audit/runs/:id` 重新验证结果，并清理本次 tenant 数据、浏览器 Profile、API 和数据库容器。

前置条件：Docker Engine 可用，且在当前 PowerShell 会话设置 `TEST_DATABASE_URL`，或创建被 Git 忽略的 `.env.test`。连接字符串不得提交。脚本只使用测试数据库，不应指向开发或生产数据库。

该测试使用受限开发扩展身份：只有 `NODE_ENV=development`、显式启用本地扩展认证、动态 Token、绑定 tenant 与精确扩展 Origin 同时满足时才可访问 API。它不调用真实模型，提交请求固定关闭 Rewrite 与 RAG。

常见失败：

- Docker 未启动：先启动 Docker Desktop，再重试；
- `TEST_DATABASE_URL` 缺失：临时设置变量或从 `.env.test.example` 创建本地 `.env.test`；
- Chromium 不可用：先确保 Playwright 可使用 Chromium；
- API readiness 超时：检查本地端口、测试数据库迁移和 API 编译结果；
- CORS/401/403：该命令会动态生成 Origin、Token 与 tenant，不能复用旧配置。

运行结束后不应保留 Token、浏览器 Profile、数据库 dump、Playwright trace 或构建产物。
