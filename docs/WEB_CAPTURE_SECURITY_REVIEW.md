# 网页采集安全评审

已落实：最小 Chrome 权限、用户触发采集、URL query/fragment 移除、敏感文本脱敏、短期 scope token、Content Script 无令牌访问。上线前阻塞项：将内存 extension/capture store 替换为 PostgreSQL Repository，接入正式登录/OAuth PKCE、CORS extension-ID 白名单、令牌轮换/撤销持久化及端到端浏览器测试。
