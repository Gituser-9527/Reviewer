# API 测试认证约定

受保护 API 的测试必须显式声明身份、权限与租户，禁止依赖无认证请求获得管理员能力。这样可以让未认证、权限不足和跨租户三类安全边界各自拥有稳定的回归测试，而不是被测试服务器的默认行为掩盖。

`apps/api/src/test-helpers/auth.ts` 提供最小测试身份：`auditOperatorIdentity` 用于审核读写，`auditReaderIdentity` 用于只读审核，`reviewerIdentity` 用于人工复核，`ruleOperatorIdentity` / `complianceManagerIdentity` 用于规则职责，`superAdminIdentity` 仅用于全局运营、系统发布、跨租户管理等真实需要 `global:manage` 的路径。成功路径应优先选择最小权限身份，而不是统一使用 Super Admin。

未认证用例不传认证 Header 并断言 `401`；已认证但无目标权限的用例传入低权限身份并断言 `403`；跨 tenant 用例使用与资源 tenant 不同的显式身份并断言 `TENANT_FORBIDDEN`。身份 helper 每次返回新的 Header 对象，不得在测试之间共享可变状态。

测试环境中的 `x-user-role` 仅是 Fastify 注入测试夹具；development 和 production API 不接受该 Header。扩展开发访问只能通过显式启用、绑定 tenant 的 Bearer 配置，并且该身份只具有 `audit:read` 与 `audit:write`。它必须配置 Token 与绑定 tenant，production 中始终禁用。未认证返回 `401`，已认证但权限或租户范围不足返回 `403`。

开发扩展 CORS 只在 development/test 中启用，且只能配置精确的 32 位 Chrome 扩展 Origin `chrome-extension://<id>`；不得使用 wildcard、任意扩展 Origin 或 credentials。CORS 只限制浏览器跨域响应，不能替代认证或 tenant 校验。测试不得把 token、Authorization Header、Cookie 或数据库连接串写入 fixture、日志或 Git。
