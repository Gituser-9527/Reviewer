# 浏览器扩展设计

扩展采用 Manifest V3、Side Panel、Content Script 与 `chrome.runtime` 消息传递。当前 Manifest 仅声明 `activeTab`、`scripting`、`sidePanel` 与 `storage`，不申请永久 `<all_urls>` 主机权限，也不配置默认 Content Script 匹配。用户点击后，Background 才通过 `activeTab + scripting` 向当前页临时注入 Content Script。

`WEB_CAPTURE_READ_CURRENT_PAGE` 返回页面标题、`main`/正文文本与 JSON-LD 文本；Side Panel 将其转换为 `PageContext`，使用 Adapter Registry 得到 `WebJobCapture` 预览。`WEB_CAPTURE_HIGHLIGHT` 和清除消息仅改变本地 CSS 标记，绝不触发页面按钮或表单。

首个技术验证位于 `apps/browser-extension/fixtures/job-posting.html`，覆盖标题与正文/JSON-LD 提取。加载扩展时使用构建输出目录 `apps/browser-extension/dist`，开发者需要先运行根目录 `npm run build`。
