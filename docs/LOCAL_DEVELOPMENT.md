# 本地开发

## 前置条件

- Node.js `>= 20.9`
- npm `>= 10`
- 可选：Docker Desktop（用于 PostgreSQL 持久化开发）

安装依赖：

```bash
npm install
```

建议先运行诊断：

```bash
npm run doctor
```

诊断会检查 Node.js、npm、`.env`、Web/API 端口、`DATABASE_URL` 对应的 PostgreSQL 端口和 Docker Compose。不会输出数据库连接串、API Key 或其他敏感环境变量。

## 一键启动

```bash
npm run dev
```

该命令会先构建共享 workspace 包，然后并行运行：

- Fastify API：`http://localhost:3001`
- Next.js Web：`http://localhost:3000`
- Health：`http://localhost:3001/health`

按 `Ctrl+C` 会同时停止两个开发进程。当前项目没有独立 worker；队列 MVP 在 API 进程内运行，因此不提供 `dev:worker`。

## 使用 PostgreSQL

不设置 `DATABASE_URL` 时，API 使用内存存储。需要持久化开发时：

```bash
Copy-Item .env.example .env
npm run dev:infra
npm run db:migrate
npm run dev
```

`dev:infra` 只启动 Docker Compose 中的 `postgres` 服务，不会启动容器化 API 或 Web，避免与本地开发端口冲突。当前 Compose 未配置 Redis。

## 常用命令

```bash
npm run dev:api      # 单独启动 API
npm run dev:web      # 单独启动 Web
npm run dev:infra    # 启动 PostgreSQL
npm run doctor       # 本地环境诊断
npm run check        # lint、test、build、i18n 检查
npm run db:migrate   # 执行数据库迁移
```

## 常见问题

### 3000 或 3001 端口已被占用

运行 `npm run doctor` 查看端口状态。关闭占用端口的进程，或在 `.env` 中修改 API 的 `PORT`；同时将 Web 的 `API_BASE_URL` 设置为新的 API 地址。

### PostgreSQL 不可用

先运行 `npm run dev:infra`，等待 `postgres` healthcheck 通过后运行 `npm run db:migrate`。诊断输出 `run npm run dev:infra` 表示 `DATABASE_URL` 指向的端口尚不可达。

### Web 能打开但 API 请求失败

确认 API 终端仍在运行，并访问 `http://localhost:3001/health`。检查 `.env` 中的 `API_BASE_URL` 是否与 API 端口一致。

### Docker 不可用

不影响默认的内存存储开发路径：移除或不设置 `DATABASE_URL`，直接运行 `npm run dev`。需要验证数据库迁移或持久化时，再安装并启动 Docker Desktop。

### 需要停止基础设施

```bash
docker compose stop postgres
```
