# 网页职位采集安全边界

- 不读取、保存或上传密码、Cookie、localStorage、Authorization Header、验证码或登录态。
- 默认仅在用户主动点击后读取当前标签页；预览与字段修正发生在本地，开始审核前不上传。
- 扩展不保存 API Key。认证使用浏览器 OAuth/PKCE 或短期、受众绑定的扩展会话令牌；令牌只保存在 `chrome.storage.session`，由后端轮换和撤销。
- 服务端将采集文本交给既有 `packages/core/src/security/` 的脱敏函数处理；扩展与服务端日志只记录摘要、哈希、长度和 Adapter 元数据，不记录完整正文。
- 仅支持用户有权访问的岗位页面；不得绕过验证码、访问控制或平台限制。新增站点权限使用 optional host permissions/白名单并要求用户明确授权。
