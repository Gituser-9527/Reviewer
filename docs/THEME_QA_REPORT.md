# Theme QA Report

日期：2026-07-14  
范围：第 50 轮前端主题系统与基础视觉层。

## 已完成检查

- 根主题 token、System/Light/Dark 偏好、持久化和首屏防闪烁。
- Header 主题切换器：主按钮切换浅/暗；菜单可选择浅色、暗色或跟随系统；具备按钮、菜单角色和焦点样式。
- AppShell、Sidebar、Header、Card、表单、按钮、状态、风险 Badge、代码预览、空/错/加载状态的 token 兼容映射。
- 中文与英文 `theme.*` 文案已加入 message 文件。
- 风险 Badge 使用文字与颜色，且高风险、警告、成功样式在两种主题下有独立前景/背景 token。

## 页面覆盖

共享 Shell 覆盖登录后 Dashboard、岗位审核、审核历史、人工复核、规则、评估、红队、发布、监控、申诉、质检、设置、无权限及其 Loading/Empty/Error 状态。登录/公开页面沿用独立 public 样式，后续应在专门的公开站视觉轮次接入同一 token 层。

## 已知后续项

历史页面仍含少量遗留颜色字面量；它们不再作为主 Shell、表单或状态组件的主题来源，但应按页面迁移时逐步消除。建议在 CI 增加 CSS token lint 和浏览器截图基线，覆盖 Light 与 Dark 的关键工作流。
