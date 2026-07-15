# Visual Style Guide

审核后台采用克制的 Apple-inspired SaaS 风格：中性背景、蓝色主要交互、清晰黑白层级、12–16px 圆角、细边框和低强度阴影。视觉效果服务于证据与风险信息的快速扫描，不改变审核规则、权限或 API。

## 组件状态

- Default：surface + border + foreground。
- Hover/selected：使用 accent，文字保持 accent-foreground。
- Focus：使用 ring，并保留 3px 可见焦点环。
- Disabled：降低不透明度但保持正文可辨。
- Error：danger/danger-foreground；Success：success/success-foreground；Warning：warning/warning-foreground；Info：info/info-foreground。

## 禁止项

- 不在业务 TSX 或页面 CSS 中新增 `#...`、`rgb()` 等主题颜色。
- 不使用大面积高饱和渐变、厚边框、重阴影或低对比文字。
- 不只用颜色表达审核状态。
- 不绕过 `ThemeProvider` 直接修改根元素主题属性。
