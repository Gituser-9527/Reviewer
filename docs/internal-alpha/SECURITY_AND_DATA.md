# 安全与数据边界

扩展仅从当前页面提取岗位名称、公司、地点、薪资、用工类型、岗位描述和要求等结构化字段；不会读取 Cookie，不上传完整 HTML。页面身份与 fingerprint 用于本地安全校验，不作为完整页面内容上传。

Popup 的开发令牌、API 地址和 tenant 配置保存在 `chrome.storage.session`；Content Script 与 MAIN world 不接触 Token、审核结果或 storage。页面世界事件最多触发本地身份复核，不能审核 API、跨标签页失效或读取结果。

每次 Pilot 使用专用 Alpha tenant，不复用生产 tenant、不使用生产数据库或真实候选人数据。API 使用显式 tenant 认证与精确 extension Origin CORS；没有 wildcard 或 cookie credentials。AuditRun、Findings、Evidence 按 tenant 持久化，页面变化不会删除后端历史。试用结束后的保留与清理由维护人员按内部政策执行；清理不等于删除必须保留的审计记录。日志和反馈必须脱敏；附件只能存放在批准的位置。
