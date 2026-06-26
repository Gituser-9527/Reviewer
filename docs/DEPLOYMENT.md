# Deployment

## 目标

本文档说明招聘岗位合规审核 Agent 的 MVP 工程化部署方式。当前支持 Docker Compose 本地/测试环境部署，生产环境可基于同一镜像拆分到 Kubernetes、ECS、云托管容器或其他平台。

## 服务组成

- `api`：Fastify REST API，默认监听 `3001`。
- `web`：Next.js 前端，默认监听 `3000`。
- `postgres`：PostgreSQL 16，保存审核任务、finding、evidence link 和人工复核反馈。

## 环境变量

基础变量见根目录 `.env.example`。

关键变量：

- `HOST`：API 监听地址，容器内使用 `0.0.0.0`。
- `PORT`：API 监听端口，默认 `3001`。
- `API_BASE_URL`：Web 代理 API 的服务地址。Compose 内使用 `http://api:3001`。
- `DATABASE_URL`：PostgreSQL 连接串。设置后 API 使用数据库持久化；未设置时使用内存存储。
- `LOG_LEVEL`：API 日志等级，默认 `info`。
- `LLM_PROVIDER`：LLM Provider 选择。MVP 默认 `mock`，不调用真实外部模型。

不要把真实密钥、未脱敏个人信息或生产数据库连接串提交到代码库。

## Docker Compose 启动

```bash
docker compose up --build
```

启动后：

- Web: `http://localhost:3000`
- API health: `http://localhost:3001/health`
- API readiness: `http://localhost:3001/health/ready`
- API metrics: `http://localhost:3001/metrics`

`api` 服务启动前会执行：

```bash
npm run db:migrate
```

该命令使用 `DATABASE_URL` 对 PostgreSQL 执行 migration。

## 镜像构建

根目录 `Dockerfile` 提供两个运行 target：

```bash
docker build --target api -t job-compliance-api .
docker build --target web -t job-compliance-web .
```

## CI

GitHub Actions 配置位于 `.github/workflows/ci.yml`。

CI 执行顺序：

1. `npm ci`
2. `npm run lint`
3. `npm test`
4. `npm run build`
5. `npm run eval`

CI 不依赖真实 LLM API Key，也不要求外部模型可用。

## 上线前检查

- `npm run lint` 通过。
- `npm test` 通过。
- `npm run build` 通过。
- `npm run eval` 通过，并检查 failedCases。
- `docker compose up --build` 可启动。
- `GET /health` 返回 `status: ok`。
- `GET /health/ready` 返回 `status: ok`。
- `GET /metrics` 可访问。
- 审核日志和持久化字段不包含完整手机号、身份证号、银行卡号、邮箱、微信号、详细地址或验证码。

## 当前边界

- Compose 适合开发、验收和单机测试，不代表生产高可用拓扑。
- `/metrics` 当前是占位级 Prometheus 文本输出，后续应接入正式指标 SDK。
- readiness 当前检查 PostgreSQL 可达性；规则文件、知识库文件和未来向量库可继续加入依赖检查。
