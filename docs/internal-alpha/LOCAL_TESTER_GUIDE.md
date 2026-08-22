# 本地 Internal Alpha 测试人员指南

本指南只建立当前电脑上的非生产、loopback Internal Alpha。它不会连接生产 API、生产数据库或云凭据，也不授权真人 Pilot。

## 前置条件

- Windows PowerShell、Node.js >= 20.9、npm >= 10；
- Docker Desktop 已启动；
- Chromium 或 Chrome；
- 从 `main` 克隆的干净仓库。不要复用 `.env`、`.env.test`、旧 Token 或旧 extension ID。

## 首次启动

```powershell
git clone https://github.com/Gituser-9527/Reviewer.git
cd Reviewer
npm ci
npm run alpha:local:setup
```

`setup` 自动检查 Node/npm/Docker、生成 gitignored 的当前用户本地配置、启动专用 PostgreSQL、等待数据库、执行 migrations、确认固定 `local-internal-alpha` tenant、构建 API 与 Extension，并运行静态 readiness doctor。它不会打印 Token、数据库 URL 或 extension ID。

加载 Extension 仍必须人工完成：

1. Chrome 打开 `chrome://extensions`，开启开发者模式；
2. 选择“加载已解压的扩展程序”，目录为 `apps/extension`（不是 `dist`）；
3. 复制显示的 extension ID；
4. 回到仓库运行：

```powershell
npm run alpha:local:configure-extension -- --extension-id <32-character-extension-id>
npm run alpha:local:api
```

第二个命令从仓库根目录以前台方式启动 API，并打印其随机 loopback 地址。以该地址加 `/health/ready` 确认 API；端口不需要猜测或写入文档。

在另一个 PowerShell 窗口中运行下列命令，把本地开发 Token 放入当前用户剪贴板，粘贴到 Extension 的“开发连接配置”后立即清空剪贴板：

```powershell
npm run alpha:local:copy-token
```

Extension 中的 API 地址使用上述 loopback 地址，tenant 使用固定 `local-internal-alpha`。Token 仅为本机开发认证，保存在 gitignored 当前用户配置及 `chrome.storage.session`；不得截图、发送或写入反馈。

运行最终环境 Doctor：

```powershell
npm run alpha:local:doctor
```

它必须无 `FAIL`；`TEST_DATABASE_URL` 的 WARN 只表示没有配置独立回归测试库，不影响本地 Alpha API。

## 允许测试

- 手动提取招聘岗位；Preview 与人工编辑；
- 手动提交审核；查看 Finding 与 Evidence；
- 错误提示、重复操作、tenant/auth 错误；
- 页面变化后的 `STALE`、手动高亮和清除；
- 基础 UX。

Extension 保持 ASSIST 模式：不会自动审核、点击、提交或投递。

## 禁止测试

- 真实个人敏感信息、生产 API/数据库、真实招聘生产页面；
- Cookie、Token、Authorization、完整 HTML 或未脱敏截图上传；
- 自动投递、Production Retention、Gold Set、Shadow、训练或 Learning Feedback UI。

使用 [FEEDBACK_TEMPLATE.md](./FEEDBACK_TEMPLATE.md) 报告问题，并提供脱敏页面描述、步骤、预期/实际、脱敏截图、浏览器/Extension 版本、严重度和可安全提供的 Audit Run ID。

## 停止与清理

先在 API 前台窗口按 `Ctrl+C`，然后运行：

```powershell
npm run alpha:local:down
```

默认命令只删除 bootstrap 专用 Compose project 的容器和网络，保留 Docker named volume、测试记录和 gitignored 当前用户本地配置，便于稍后以同一环境重启。若明确需要连同本地记录和本地凭据一起删除：

```powershell
npm run alpha:local:down -- --purge-data
```

这两个命令只操作 `docker-compose.alpha-local.yml` 声明的资源，不影响其他项目容器。
