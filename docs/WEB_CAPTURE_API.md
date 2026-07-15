# Web Capture API

扩展 bearer token 的 scope 分别控制 `POST /api/web-captures`、`GET /api/web-captures/:id` 与 `POST /api/web-captures/:id/audit`。创建时限制正文至 100,000 字符、清洗 URL、脱敏文本；审核复用既有 `auditJobPosting` 编排和 AuditRun Store，未实现单独规则直调。未认证、令牌过期和 scope 不足分别返回稳定扩展认证错误。
