# 招聘岗位合规审核 Agent

招聘岗位合规审核系统的 TypeScript monorepo。当前版本包含确定性 YAML 规则审核、结构化抽取、本地法规依据检索、REST API 和基础审核页面。

## 技术栈

- Monorepo：npm workspaces
- Backend：Node.js、TypeScript、Fastify
- Frontend：Next.js、React、TypeScript
- Test：Vitest
- Quality：ESLint、Prettier
- Database：PostgreSQL、Drizzle ORM，预留 pgvector 演进

## 环境要求

- Node.js `>= 20.9`
- npm `>= 10`

本项目已在 Node.js `24.11.1`、npm `11.6.2` 下验证。

## 安装

```bash
npm install
```

## 本地启动

安装依赖后，一条命令启动 API 与 Web：

```bash
npm run dev
```

启动日志会显示以下本地地址：

- Web：`http://localhost:3000`
- API：`http://localhost:3001`
- Health：`http://localhost:3001/health`

默认不配置 `DATABASE_URL` 时，API 使用进程内存存储，适合开发和测试。如果需要 PostgreSQL 持久化，请先复制 `.env.example` 为 `.env`，再启动基础设施：

```bash
npm run dev:infra
npm run db:migrate
npm run dev
```

也可以按需单独运行：

```bash
npm run dev:api    # 仅 API
npm run dev:web    # 仅 Web
npm run doctor     # 检查 Node、npm、端口、环境变量、PostgreSQL 和 Docker Compose
```

Web 会将 `/api/*` 代理到 `http://localhost:3001`。可通过 `API_BASE_URL` 修改代理目标，也可使用 `.env.example` 中的变量覆盖 API 的 `HOST` 和 `PORT`。不要提交包含密钥或敏感数据的 `.env` 文件。当前没有独立 worker 或 Redis 进程；异步任务 MVP 在 API 进程内运行。

如需启用 PostgreSQL 持久化，先设置 `DATABASE_URL` 并执行迁移：

```bash
npm run db:migrate
```

未设置 `DATABASE_URL` 时，API 会使用进程内存存储，便于本地开发和单元测试。

## 健康检查

```bash
curl http://localhost:3001/health
```

同时提供与架构文档一致的端点：

- `GET /health`
- `GET /health/live`
- `GET /health/ready`

当前 readiness 仅表示 API 进程可响应。数据库、规则集等依赖接入后，需要扩展为真实依赖检查。

## 常用命令

```bash
npm run build         # 构建共享包、API 和 Web
npm test              # 运行 Vitest 测试
npm run test:watch    # 监听模式测试
npm run typecheck     # 构建包并检查应用类型
npm run lint          # 运行 ESLint
npm run format        # 使用 Prettier 格式化
npm run format:check  # 检查格式
npm run db:migrate    # 使用 DATABASE_URL 执行 PostgreSQL migration
npm run build:extension # 构建浏览器扩展
npm run cleanup:web-captures -- --dry-run # 检查网页采集正文清理
npm run dev           # 同时启动 API 和 Web
npm run dev:infra     # 启动本地 PostgreSQL Docker 服务
npm run doctor        # 检查本地开发环境
npm run check         # lint + test + build + i18n 检查
```

## 目录结构

```text
.
├─ apps/
│  ├─ api/             # Fastify REST API
│  └─ web/             # Next.js 管理台
├─ packages/
│  ├─ core/            # 领域类型与 LLM/RAG/规则/持久化端口
│  ├─ database/        # PostgreSQL schema、migration 与 repository
│  └─ shared/          # 稳定枚举、共享 DTO
├─ rules/              # YAML 规则预留目录
├─ knowledge/          # 合规知识与 RAG 资产预留目录
├─ evals/              # 评测集与报告预留目录
├─ docs/               # 产品和架构规划
├─ AGENTS.md           # 工程协作约束
└─ TASKS.md            # 分阶段实施任务
```

## 当前边界

已经具备：

- npm workspace monorepo
- 严格 TypeScript 配置
- Fastify API 与健康检查
- Next.js 基础页面
- 核心审核枚举和基础类型
- LLM Provider、向量检索、Repository 与数据库端口
- YAML 规则引擎与本地 Markdown/JSON 依据检索
- PostgreSQL 持久化 schema、migration、repository 与 API 查询适配
- lint、format、test、typecheck、build 命令

尚未实现：

- LLM Provider 适配器
- pgvector 语义检索与自动知识摄取
- 鉴权、租户隔离、审计日志和人工复核

后续实施顺序以 [TASKS.md](./TASKS.md) 和 `docs/` 下的权威规格为准。
