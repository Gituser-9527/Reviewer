# 故障排查

| 现象 | 安全排查 |
| --- | --- |
| Popup 无法打开 / 扩展重载 | 重新执行 `npm run build:extension`，确认加载目录为 `apps/extension`；重新输入 session 配置。 |
| 无法提取或字段错误 | 确认是招聘页面；手动修正字段；不支持页面记录为反馈，不上传完整 HTML。 |
| 提交按钮禁用 / 页面 STALE | 页面已变化或身份未确认；重新提取，不使用旧 Capture。 |
| 401 / 403 | 请维护人员核对受控 Token、tenant 绑定与开发认证开关；不要把 Token 发给试用人员群组。 |
| CORS / API 无法访问 | 维护人员核对 API 地址和精确扩展 Origin；不得使用 wildcard、关闭认证或设置 credentials。 |
| PostgreSQL 不可用 | 维护人员核对 migration、数据库可达性和安全环境变量名称；不要在反馈中发送连接串。 |
| 高亮无法定位或清除 | 保持同一岗位页面打开，先清除再重试；记录脱敏 Finding 摘要。 |
| 切换后仍见旧内容 | 停止使用该结果，重新提取；若旧结果仍为 CURRENT，按停止条件升级。 |
| Service Worker 重启 | 重新打开 Popup；仅在页面身份匹配时恢复 CURRENT，否则重新提取。 |
