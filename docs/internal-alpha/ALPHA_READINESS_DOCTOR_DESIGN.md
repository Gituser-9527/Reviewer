# Internal Alpha Readiness Doctor 设计

## 1. 目标与非目标

Alpha Readiness Doctor 是供维护人员在受控内部 Alpha 启动前运行的只读诊断工具。它的目标是发现环境准备缺口，并将结果映射到 [ALPHA_READINESS_CHECKLIST.md](./ALPHA_READINESS_CHECKLIST.md) 与 [ALPHA_GO_NO_GO_TEMPLATE.md](./ALPHA_GO_NO_GO_TEMPLATE.md) 中需要人工确认的项目。

Doctor 不是 Alpha 自动批准器、Go/No-Go 决策替代品或安全审查替代品。即使所有自动检查通过，维护人员仍必须完成受控真实审核并填写 Go/No-Go 记录。

Doctor 不得：

- 调用岗位审核、改写、RAG、Semantic Classifier 或 Reflection；
- 写入数据库、执行 migration、创建或修改 tenant；
- 修改认证、CORS、环境变量、扩展配置或 Manifest；
- 自动提交审核、自动高亮或自动操作招聘网站；
- 输出、持久化或上传 Token、Secret、API Key、Cookie、Authorization、数据库 URL、真实 tenant 标识或完整页面内容。

## 2. 与现有 Doctor 的关系

现有入口是 `npm run doctor:internal-alpha`，由以下文件组成：

- `scripts/internal-alpha-doctor-lib.mjs`：可注入文件系统、环境和命令执行器的纯诊断逻辑；
- `scripts/internal-alpha-doctor.mjs`：逐行输出结果并依据汇总设置退出码的 CLI；
- `scripts/internal-alpha-doctor.test.mjs`：使用 fake 文件系统、环境和命令执行器的 Node 单元测试；
- `package.json`：提供 CLI 入口，并将现有 Doctor 测试纳入 `npm test`。

现有能力检查 Node/npm、仓库文件、Manifest 版本、本地构建产物、URL 静态格式、必要配置是否存在和 Git 工作区状态。它不建立网络连接，不连接数据库，不调用审核 API；配置结果只表达“已配置/未配置”，不会回显值。CLI 输出格式为一行一个结果：`PASS|WARN|FAIL <检查名>: <脱敏说明>`，汇总行显示 FAIL/WARN 计数；仅存在 `FAIL` 时退出码为非零。

建议后续在同一模块化、可注入和可测试的结构内扩展 readiness 能力，而不是另建不可测试的脚本。实现前须先确定可公开读取的 health/version 契约和只读数据库访问契约。

## 3. 设计原则与运行边界

1. 默认离线：未显式启用外部检查时，只运行现有本地静态检查。
2. 显式启用：网络或数据库检查必须由维护人员显式选择，且每类检查可独立关闭。
3. 最小访问：网络请求只允许目标 Alpha API 的预定义只读 health/version 端点；数据库检查必须使用只读专用凭据或受限只读连接。
4. 有界执行：设置连接与响应超时、最大响应字节数和固定请求次数；不跟随任意重定向，不扫描网络、不枚举 tenant。
5. 只输出摘要：结果使用固定检查名、状态码、版本摘要或布尔状态；原始响应体、请求头、连接串、异常文本和环境变量值均不得输出。
6. 失败保守：无法建立安全的只读检查时，输出 `WARN` 或 `FAIL`，并把需要人工处理的事项写入 checklist；不得假定通过。
7. 不改变决策：Doctor 的结果只能辅助维护人员，不得改变 Production YAML Rule Engine、审核决策、tenant 隔离或扩展行为。

## 4. 检查分类

### Application

| 检查 | 拟议只读方法 | 结果规则 | 自动化边界 |
| --- | --- | --- | --- |
| API 可访问 | 仅对显式配置且经 URL 校验的 Alpha API origin 发起有界 `GET /health/live` 与 `GET /health/ready`。 | 两端点成功为 `PASS`；不可达或非成功为 `FAIL`；未启用为 `WARN`。 | 不调用审核 API；不得打印 origin、响应体、请求头或错误详情。 |
| 服务版本 | 仅在已定义、无敏感字段的只读 version 契约存在时读取版本。 | 合法且与期望版本策略匹配为 `PASS`；端点缺失或未定义契约为 `WARN`。 | 在契约落地前不得猜测 endpoint 或解析任意响应。 |
| 环境标识 | 读取明确的非敏感环境标签或受控 health 元数据。 | 确认是 Alpha/非生产为 `PASS`；无法确认或显示生产为 `FAIL`。 | 不以 URL 字符串推断环境；不得输出内部域名。 |

### Database

| 检查 | 拟议只读方法 | 结果规则 | 自动化边界 |
| --- | --- | --- | --- |
| 数据库连接状态 | 仅使用维护人员提供的只读专用连接执行受限、无副作用的健康查询。 | 成功为 `PASS`；拒绝、超时或不可达为 `FAIL`；未启用为 `WARN`。 | 不使用可写管理凭据；不输出连接串、主机、库名、用户或原始错误。 |
| migration 状态 | 在已约定 schema 的前提下，对 migration 元数据执行固定只读查询，并与应用期望版本比较。 | 一致为 `PASS`；缺失或落后为 `FAIL`；schema/期望版本契约尚未定义为 `WARN`。 | 不执行 migration、DDL、修复或数据写入。 |

### Authentication

| 检查 | 拟议方法 | 结果规则 | 自动化边界 |
| --- | --- | --- | --- |
| 必需配置存在性 | 复用现有“存在性而非值”检查，覆盖开发扩展认证开关、短期凭据、tenant 绑定和精确 Origin 所需的配置名称。 | 必填名称完整为 `PASS`；部分存在或无效组合为 `FAIL`；未配置环境为 `WARN`。 | 不验证、不解码、不输出 Token；不发起登录或 token 刷新。 |
| 凭据策略 | 仅检查可公开的策略标志或安全配置的存在性。 | 只能证明配置存在，不得证明权限最小化。 | 最小权限、期限和撤销能力必须人工确认。 |

### Extension

| 检查 | 拟议只读方法 | 结果规则 | 自动化边界 |
| --- | --- | --- | --- |
| Manifest 版本 | 解析仓库内 `apps/extension/manifest.json`。 | 版本字段有效为 `PASS`；缺失或格式无效为 `FAIL`。 | 不构建、加载、重载或修改扩展。 |
| 权限列表 | 以固定允许基线比较 Manifest 权限和 host permissions。 | 与经批准基线一致为 `PASS`；扩大、缺失基线或无法解析为 `FAIL`/`WARN`。 | 基线必须在实现前经安全评审确定；Doctor 不修改 Manifest。 |
| Origin 配置 | 校验配置值的 URL 形状、协议和是否为精确单个 extension Origin。 | 合法形状为 `PASS`；通配符、多个不允许 Origin 或格式错误为 `FAIL`。 | 不输出真实 extension ID；实际浏览器加载 ID 与 CORS 生效情况仍需人工验证。 |

### Tenant

| 检查 | 拟议方法 | 结果规则 | 自动化边界 |
| --- | --- | --- | --- |
| tenant 配置存在性 | 只检查 tenant 配置名存在，并检查认证配置是否包含 tenant 绑定。 | 存在且组合完整为 `PASS`；缺失为 `FAIL`；未启用为 `WARN`。 | 不输出 tenant 值、不枚举 tenant、不创建 tenant，也不把存在性视为隔离验证。 |
| tenant 隔离 | 不在 Doctor 中自动判定。 | 由人工受控审核记录为 checklist 状态。 | 需要真实但隔离的审核记录、审计记录和越权负例验证。 |

### Data Governance

| 检查 | 拟议方法 | 结果规则 | 自动化边界 |
| --- | --- | --- | --- |
| retention 配置 | 仅检查非敏感 retention 配置或已批准策略引用是否存在。 | 存在为 `PASS`；缺失为 `WARN` 或 `FAIL`（取决于启动门禁定义）。 | 不读取审核内容、不清理数据、不输出保留期以外的内部策略细节。 |
| cleanup 责任字段 | 检查部署或运行记录中是否有责任角色/工单引用字段。 | 存在为 `PASS`；缺失为 `WARN`。 | 责任人是否已执行及审计例外必须人工确认。 |

## 5. 输出与退出码规范

每个检查输出一行：

```text
PASS Application API readiness: endpoint responded within configured limit
WARN Database migration state: read-only contract is not enabled
FAIL Extension origin configuration: exact-origin validation failed
Summary: 1 FAIL, 1 WARN, 1 PASS
```

输出字段只能包含状态、固定检查分类/名称和经过白名单模板生成的简短说明。不得插入环境变量值、请求 URL、响应体、HTTP header、异常消息、数据库错误、SQL、凭据或 tenant 值。日志与结构化输出（如果后续引入）同样必须使用此白名单数据模型。

退出码规则：

- `0`：没有 `FAIL`；允许存在 `WARN`，但 Go/No-Go 仍由人工决定。
- 非 `0`：至少一个 `FAIL`；不得进入 Go 决策。
- 进程异常：返回非零，并仅输出固定的内部诊断失败摘要；不得回显异常内容。

## 6. AUTO CHECK 与 MANUAL CHECK

### AUTO CHECK

- Node/npm、仓库文件、构建产物、Git SHA/工作区、Manifest 版本和权限基线的静态检查；
- 必需配置名称是否存在、URL/Origin 的静态格式与精确性校验；
- 显式启用后的有界 API health/readiness 探测；
- 显式启用、使用只读专用连接后的数据库可达性与固定 migration 元数据查询；
- 已定义的非敏感服务版本、环境标签、retention 策略引用与 cleanup 责任字段的存在性检查；
- 输出白名单、敏感字符串不回显、`FAIL` 才为非零退出的行为检查。

### MANUAL CHECK

- Alpha API 是否实际处于隔离环境，HTTPS/访问控制是否符合组织政策；
- 专用 tenant 已创建、tenant 隔离和跨 tenant 越权负例验证；
- 最小权限、凭据期限、保管渠道、撤销流程与人员访问范围；
- 浏览器实际加载得到的 extension ID 与服务端精确 Origin/CORS 的端到端生效；
- 允许/禁止测试站点范围、测试数据与截图的脱敏处理；
- 数据保留、清理责任、审计例外及批准记录；
- 维护人员完成受控真实审核，确认人工提交、人工查看、无自动审核、无自动高亮和无自动页面操作；
- 内部用户反馈、问题升级、暂停 tenant 与凭据撤销流程。

## 7. 实现范围与接口建议

本轮不实现。后续实现应拆分为可替换的只读端口，而非在 CLI 内直接耦合网络或数据库 SDK：

- `EnvironmentReader`：只读取配置是否存在及非敏感标志；
- `HttpReadinessProbe`：只支持明确 allowlist 的 GET health/version 请求、超时与响应大小上限；
- `ReadOnlyDatabaseProbe`：只支持固定查询和只读凭据，返回枚举化摘要；
- `ManifestInspector`：解析并对比批准的静态权限基线；
- `RedactedReporter`：只接收枚举状态和白名单详情，负责 CLI/结构化输出；
- `DoctorRunner`：聚合检查结果，执行 `FAIL` 优先的退出码规则。

所有端口均应通过依赖注入使用 fake 实现测试。默认配置不应自动发起网络或数据库连接；要运行外部 probe，维护人员必须显式选择，并提供经批准的最小权限配置。

## 8. 测试策略

### 单元测试

- 各检查的 `PASS`、`WARN`、`FAIL`、超时、禁用和异常分支；
- URL/Origin 精确性、Manifest 权限基线、配置存在性和版本比较；
- 数据库 probe 只调用允许的固定查询，且拒绝任何写操作或非只读接口；
- `FAIL` 才触发非零退出码，单独 `WARN` 保持零退出码；
- 默认模式不创建 HTTP 或数据库客户端。

### CLI 输出测试

- 行格式、汇总计数、稳定检查名和退出码；
- 错误、超时、无效响应和依赖异常只能生成固定摘要；
- 外部 probe 未显式启用时显示 `WARN`，而非假装环境已通过。

### 敏感信息扫描测试

- 在 fake 环境变量、URL、数据库错误、HTTP header、响应体和异常中注入 Token、Authorization、Cookie、API Key、数据库 URL 和 tenant 值；
- 断言 CLI stdout、stderr、结构化结果和日志 payload 均不包含注入值；
- 断言输出仅含白名单枚举与固定模板文本；
- 将泄漏样本加入回归测试，防止后续新增检查绕过统一脱敏输出器。

## 9. 启动门禁映射

Doctor 结果应写入 readiness checklist 的“脱敏证据位置”，而不是替代 checklist。只有 main CI、环境隔离、专用 tenant、凭据策略和人工审核流程均在 checklist 中获得人工确认，且没有未处置的 `FAIL`，维护人员才可填写 Go/No-Go 模板。Doctor 的 `PASS` 不能单独授权真人 Pilot。
