# 受控内部 Alpha 试用

本目录是浏览器扩展岗位审核能力的内部试用入口。它面向指定维护人员、内部审核员和观察员，不面向公开用户。

## 目标与边界

系统可由用户手动提取岗位、修正字段、提交审核、查看 Finding，并手动应用或清除页面高亮。SPA 岗位切换、同 URL 内容替换或页面身份无法确认时，旧结果会变为 `STALE`，不得用于当前页面。

结果是可解释的辅助意见，最终合规判断、岗位处置和业务动作由人工负责。不得用于无人监督的自动拒绝、自动发布、自动修改岗位或候选人流程决策。

当前为 ASSIST 模式：不自动审核、不自动高亮、不自动点击或提交招聘网站。Production YAML Rule Engine 可用；Semantic Classifier 和 Reflection 在生产默认 `UNAVAILABLE`，没有自动 Mock 回退。

## 快速入口

1. 维护人员先按 [SETUP_GUIDE.md](./SETUP_GUIDE.md) 配置受控 API、PostgreSQL、测试 tenant 与开发扩展认证。
2. 运行 `npm run doctor:internal-alpha`；处理所有 `FAIL`，记录 `WARN`。
3. 构建扩展并按安装指南加载 `apps/extension` 为 unpacked extension。
4. 试用人员按 [USER_GUIDE.md](./USER_GUIDE.md) 手动操作，并用 [TEST_PLAN.md](./TEST_PLAN.md) 记录结果。
5. 问题使用 [FEEDBACK_TEMPLATE.md](./FEEDBACK_TEMPLATE.md)；出现停止条件立即停止试用并通知维护人员。

Doctor 仅检查本地版本、文件、Manifest、URL 静态格式和配置变量是否存在。Doctor 通过不表示 Alpha API 已在线、数据库已连接、tenant 已创建、Token 有效或 CORS 已部署；真人 Pilot 前仍须由维护人员人工验证 health、migration、专用 tenant、最小权限凭据、精确 extension Origin 以及一次受控真实审核。

## 完全本地测试人员 Bootstrap

有基本技术能力的内部测试人员可按 [LOCAL_TESTER_GUIDE.md](./LOCAL_TESTER_GUIDE.md) 从干净 `main` clone 建立完全 loopback、非生产的本地 Alpha。它使用独立 Docker PostgreSQL、固定本地 tenant、gitignored 的本机开发凭据和人工获取的精确 extension ID；不替代共享 Alpha、生产部署或真人 Pilot Go/No-Go。

启动前使用 [ALPHA_READINESS_CHECKLIST.md](./ALPHA_READINESS_CHECKLIST.md) 记录准备状态，以 [ALPHA_GO_NO_GO_TEMPLATE.md](./ALPHA_GO_NO_GO_TEMPLATE.md) 记录人工 Go/No-Go 决策；[ALPHA_READINESS_DOCTOR_DESIGN.md](./ALPHA_READINESS_DOCTOR_DESIGN.md) 说明本地静态 Doctor 与后续只读探测的边界。

维护人员可使用 [LOCAL_SMOKE_RUNBOOK.md](./LOCAL_SMOKE_RUNBOOK.md) 在完全本地、脱敏夹具中进行一次人工 ASSIST Smoke；该 Smoke 不属于真人 Pilot，也不构成 Alpha Go。

## 适用与停止

启动门禁、停止条件和支持范围见 [TEST_PLAN.md](./TEST_PLAN.md)。安全数据边界见 [SECURITY_AND_DATA.md](./SECURITY_AND_DATA.md)，限制见 [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md)。

## 反馈与升级

将脱敏反馈交给指定维护人员；不要发送 Token、Cookie、Authorization、数据库连接串、完整内部岗位页面或候选人资料。遇到旧岗位结果显示为新岗位、跨 tenant 数据、认证信息暴露、自动审核/高亮或数据库错误归属时，立即暂停试用。
