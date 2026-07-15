# Theme System

第 50 轮建立了统一的 Light、Dark 与 System 主题系统。主题偏好保存于浏览器 `localStorage`；未主动选择时使用 System。页面在首个 React 渲染前即根据该偏好设置 `data-theme`，避免明显的主题闪烁。

## 语义 Token

主题定义并要求使用：`--background`、`--foreground`、`--surface`、`--surface-elevated`、`--surface-muted`、`--card`、`--card-foreground`、`--popover`、`--popover-foreground`、`--primary`、`--primary-foreground`、`--secondary`、`--secondary-foreground`、`--muted`、`--muted-foreground`、`--accent`、`--accent-foreground`、`--border`、`--input`、`--ring`、`--success`、`--success-foreground`、`--warning`、`--warning-foreground`、`--danger`、`--danger-foreground`、`--info`、`--info-foreground`。

业务组件不得新增页面级颜色常量。旧组件由 `styles.css` 的兼容层映射到同一套语义 token，后续重构应直接使用 token。

## 使用规则

- 正文使用 `foreground`，说明文字使用 `muted-foreground`，不可在浅色背景使用白色或浅灰正文。
- 表面、卡片、菜单和弹窗分别使用 surface/card/popover token，且必须带语义边框。
- 输入、焦点环、自动填充与禁用态由全局组件样式统一处理。
- Header 使用轻透明背景与背景模糊；交互动画不超过 150ms，且遵从减少动态效果偏好。

## 风险状态

风险状态除颜色外必须显示文字：PASS（成功）、ALLOW_WITH_WARNING（警告）、MANUAL_REVIEW（高风险提醒）、REJECT（危险）、NEED_MORE_INFO（信息）。两种主题中 Badge 统一使用深色前景和带边框的语义背景，不能使用浅底白字。
