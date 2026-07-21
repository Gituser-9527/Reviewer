# 安装与配置指南

## 角色

维护人员负责 PostgreSQL、migration、专用 Alpha tenant、开发认证与精确扩展 Origin；安装支持人员负责构建、加载扩展并在受控测试浏览器会话内完成最小配置；普通试用人员不接触 Token、数据库、CORS 或服务端环境变量。

安装支持人员不得接触数据库密码、服务端 provider secret、其他 tenant 凭据或生产管理员 Token。普通试用人员只能提取、修正、手动提交、查看、手动高亮/清除及反馈；不得创建 tenant、修改 CORS、运行 migration 或复制管理员凭据。

## 前置条件

- Node.js >= 20.9、npm >= 10；使用 `node --version`、`npm --version` 核对。
- PostgreSQL 由维护人员提供；不要将连接串放入 Git、聊天或反馈。
- Chromium/Chrome 的开发者模式仅用于受控内部机器。

## 维护人员：API 与数据库

1. 在仓库根目录执行 `npm ci`。
2. 在安全的进程环境、服务管理器或秘密管理系统配置 `DATABASE_URL`、`LLM_SECRET_ENCRYPTION_KEY`、`NODE_ENV=development`、`DEV_EXTENSION_AUTH_ENABLED=true`、`DEV_EXTENSION_AUTH_TOKEN`、`DEV_EXTENSION_TENANT_ID` 与 `DEV_EXTENSION_ORIGINS`。当前 API 启动程序不会自动加载 `.env`；只配置变量，不在文档中记录值。
3. `DEV_EXTENSION_ORIGINS` 必须是加载后得到的精确 `chrome-extension://<32 位扩展 ID>`，不得使用 wildcard；Token 必须绑定指定 tenant。
4. 执行 `npm run db:migrate`，再执行 `npm run build:packages` 和 `npm run build --workspace @job-compliance/api`。
5. 使用 `npm run dev:api` 启动开发 API，或构建后使用 `npm run start --workspace @job-compliance/api`。以 `GET /health/live` 和 `GET /health/ready` 进行连通性验证。

设置 `DATABASE_URL` 时 API 要求 `LLM_SECRET_ENCRYPTION_KEY`；这不启用真实模型。不要设置真实付费模型凭据，Semantic/Reflection 仍按默认不可用处理。

## 安装人员：扩展

1. 执行 `npm run build:extension`。
2. 在 Chrome/Chromium 打开扩展管理页，启用开发者模式，选择“加载已解压的扩展程序”。
3. 选择仓库中的 `apps/extension` 目录（不是 `apps/extension/dist`）。记录显示的扩展 ID，只交给维护人员用于精确 CORS Origin 配置。
4. 安装支持人员在受控测试浏览器会话中展开“开发连接配置”，按维护人员的安全渠道输入 API 地址、专用 Alpha tenant 和最小权限、短期 Bearer。令牌仅存放在 `chrome.storage.session`，关闭浏览器会丢失；不得通过群聊、URL、网页 Console、截图或反馈传播。
5. 将已配置的受控会话交给指定试用人员使用。每名试用人员或试用批次应使用隔离凭据；泄漏、人员变更或试用停止时由维护人员立即撤销受影响凭据。

## 普通试用人员：首次连通性

1. 在维护人员已经配置的受控会话中，打开允许的静态岗位页面并点击“提取当前岗位”。
2. 核对并修正标题和描述后提交审核。
3. 若出现 `401`，请维护人员核对令牌；若 `403`，核对 tenant 与绑定 tenant；若 CORS 错误，维护人员核对精确扩展 ID。试用人员不得复制、查看或修改令牌；不得关闭认证或放宽 CORS。

## 本地数据库测试（维护人员）

仅使用测试数据库：按 [../TEST_DATABASE_GUIDE.md](../TEST_DATABASE_GUIDE.md) 设置 `TEST_DATABASE_URL`，再运行 `npm run test:extension:local-api:postgres`。该命令会自行管理测试数据库，不得指向 Alpha 或生产数据库；普通试用人员不得运行 migration、reset 或清理命令。
