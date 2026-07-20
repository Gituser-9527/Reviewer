# BYOK 安全审查

- 使用 AES-256-GCM，密钥来自 `LLM_SECRET_ENCRYPTION_KEY`，不写入数据库或 Git。
- 数据库只保存密文、IV、认证标签和版本；API Key 明文不会进入 API 响应或审计记录。
- Settings API 返回 `sk-****xxxx`，编辑留空不会读取或回填密钥。
- Provider 在调用前沿用 `sanitizeLLMMessages`；未配置主密钥的 BYOK 创建安全失败。
- 上线前仍需：KMS/Secret Manager 轮换流程、Postgres repository、最小请求验证和独立渗透测试。
