# 扩展认证设计

当前 Web 管理台仅有基于请求头的开发身份上下文，尚无 JWT/Session。因此扩展不复用浏览器 Cookie，也不新建账号：`POST /api/extension-auth/authorize` 在当前后台身份下签发 5 分钟、一次性授权码；`/token` 交换为 15 分钟 access token 和可轮换 refresh token。令牌只包含既有用户、租户和最小 scope，服务端仅保存哈希；扩展只能在 Background 中使用 access token，Content Script 永不接触令牌。

生产接入正式登录后，应将授权码和令牌记录接入 `extension_authorizations`，并用 OAuth PKCE 替换当前受控开发流程；撤销须同时使同一授权的 access/refresh token 失效。
