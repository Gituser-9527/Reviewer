# Layout Refinement Report

## 已完成

- 建立 compact/default/wide/full 页面宽度与 Desktop/Tablet/Mobile gutter token。
- 建立 12/16/24px 间距、32/40/44px 控件和 16/20/24px 卡片尺寸体系。
- 浅色主题从高亮白调整为暖中性背景、略亮卡片与可见边界；暗色 token 未改动。
- 新增 `MetricCard`：固定信息行、数值基线与说明行，避免同组 KPI 被内容撑高。
- Dashboard 由五列 KPI 改为四列自适应核心 KPI；版本信息合并为运行环境元数据区。
- 快捷入口改为 auto-fit 等高 Grid，并为中英文标题/说明增加行数约束。
- 审核、人工复核、规则、评估、监控的 Split Pane 统一为比例式 Grid；窄屏收敛至单列。
- 所有共享输入、Select、Button 和 Card 接入统一尺寸 token。

## 未改变

后端 API、审核判断、权限、路由和业务字段均未变更。

## 后续建议

历史页面仍有早期 `masthead` 与页面级样式，可在功能迭代时逐页替换为 `PageContainer`、`Card` 和 `FilterBar`，避免高风险的大范围一次性重写。
