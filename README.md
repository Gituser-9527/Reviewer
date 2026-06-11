# 招聘岗位合规审核 Agent

招聘岗位合规审核系统的 TypeScript monorepo。当前版本仅包含工程骨架、核心类型与扩展端口，不包含 LLM、RAG、规则引擎或数据库的具体业务实现。

## 技术栈

- Monorepo：npm workspaces
- Backend：Node.js、TypeScript、Fastify
- Frontend：Next.js、React、TypeScript
- Test：Vitest
- Quality：ESLint、Prettier
- Database：预留 PostgreSQL/pgvector 接口，尚未接入驱动和迁移

## 环境要求

- Node.js `>= 20.9`
- npm `>= 10`

本项目已在 Node.js `24.11.1`、npm `11.6.2` 下验证。

## 安装

```bash
npm install
```

## 本地启动

分别打开两个终端。

启动 API，默认监听 `http://localhost:3001`：

```bash
npm run dev:api
```

启动 Web，默认监听 `http://localhost:3000`：

```bash
npm run dev:web
```

可复制 `.env.example` 中的变量到本地环境覆盖 API 的 `HOST` 和 `PORT`。不要提交包含密钥或敏感数据的 `.env` 文件。

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
```

## 目录结构

```text
.
├─ apps/
│  ├─ api/             # Fastify REST API
│  └─ web/             # Next.js 管理台
├─ packages/
│  ├─ core/            # 领域类型与 LLM/RAG/规则/持久化端口
│  ├─ database/        # 数据库能力接口，暂无 PostgreSQL 实现
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
- LLM Provider、RAG、规则引擎、Repository 与数据库端口
- lint、format、test、typecheck、build 命令

尚未实现：

- 岗位审核业务流程
- YAML 规则加载与执行
- LLM Provider 适配器
- RAG 检索与知识库
- PostgreSQL/pgvector 连接和迁移
- 鉴权、租户隔离、审计日志和人工复核

后续实施顺序以 [TASKS.md](./TASKS.md) 和 `docs/` 下的权威规格为准。
