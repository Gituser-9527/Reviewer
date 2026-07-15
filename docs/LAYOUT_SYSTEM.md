# Layout System

## 宽度与间距

| Token | 值 | 使用场景 |
| --- | --- | --- |
| `--layout-compact` | 960px | 设置详情、短表单 |
| `--layout-default` | 1280px | 审核详情、普通工作台 |
| `--layout-wide` | 1440px | Dashboard、规则、监控 |
| `--page-gutter` | 32px / 20px / 16px | Desktop / tablet / mobile |
| `--space-section` | 24px | 主功能区之间 |
| `--space-group` | 16px | 同一功能组内 |
| `--space-content` | 12px | 卡片内部紧密信息 |

## Grid

- Dashboard KPI：宽屏 4 列，中屏 2 列，移动端 1 列。
- 通用指标、快捷入口：使用 `repeat(auto-fit, minmax(...))`；同组 `grid-auto-rows: 1fr`。
- 审核工作台：`45% / 55%`；窄屏降为单列。
- 人工复核：队列 / 详情 / 决策三栏，桌面优先保留详情主列。
- 数据表外层允许横向滚动，不以缩小字体换取容纳。

## 层级

页面标题 28px；区域标题 20px；卡片标题 15px；核心数值 32px；正文 14px；辅助说明 12px。版本、ID、时间必须位于 metadata 区，不占主 KPI 面积。
