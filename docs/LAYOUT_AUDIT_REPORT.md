# Layout Audit Report

日期：2026-07-15  
范围：登录后审核后台的 Dashboard、岗位审核、人工复核、规则、评估、监控、设置及共享组件。

## 审计结论

目前前端同时存在早期页面样式与第 38–50 轮设计层。两套规则对相同的布局概念定义了不同尺寸，造成“同功能不同外观”的根因，而非单页缺少几个 margin。

| 项目 | 发现 | 影响范围 | 本轮处理 |
| --- | --- | --- | --- |
| 页面宽度 | 同时存在 1120px、1220px、1480px 与页面内独立 max-width | 详情、规则、评估、监控 | 统一为 compact/default/wide/full token |
| 卡片尺寸 | padding 有 14/16/18/20/22/24px；圆角有 14–30px | 所有后台页 | 卡片、指标卡、快捷入口收敛至 16/20/24px 体系 |
| 控件高度 | 输入与按钮混用 38/42/44/46px | 表单、筛选、Header | 默认控件统一 40px，保留 sm/lg 语义尺寸 |
| Dashboard | 10 个 KPI 与 8 个快捷入口同级展示；版本信息占据核心 KPI | Dashboard | KPI 精简为核心业务指标；运行环境合并为辅助区域 |
| 工作区卡片 | 白色渐变、最小高度与说明长度共同导致主题和高度不稳定 | Dashboard | 使用 token、两行/三行截断、等高 Grid |
| 审核工作台 | 左右列约 45/55 已接近目标，但内部卡片间距不统一 | Audit | 统一 Split Pane、卡片和操作区间距 |
| 人工复核 | 三栏布局合理，但窄屏直接单列，缺少内容优先级规则 | Reviews | 采用统一三栏响应式断点和中栏优先规则 |
| 规则/评估/监控 | 固定侧栏宽度 320/340/360/390px 并行存在，工具栏分散 | Rules/Evals/Monitoring | 收敛为统一 sidebar token 与 Filter/Action bar 规范 |
| 浅色主题 | 页面与卡片接近纯白，卡片层级过亮 | 全局 | 改为温和暖中性背景和轻层级 surface |

## 对齐、留白与响应式问题

- 主内容区域使用 34px，Banner 又使用 18px/34px，页面区块间距混用 14/18/22/28px。
- `dashboard-grid--wide` 为五列，窄桌面下指标标题和数值容易挤压；应改为四列并在中等屏降两列。
- `workspace-hub` 固定六列，英文长标题与说明会造成高度不一；应使用自动适配网格与统一行高。
- 规则、评估、监控的左栏使用多种固定像素宽度；这会在 1024–1280px 区间压缩编辑/表格主体。
- 长 ruleId、证据、岗位原文、说明文字会抬高卡片；需要 line clamp、表格列最大宽度与详情承载面板。

## 视觉层级问题

- 版本号（rule/lawKB/model）与核心 KPI 同级，不利于审核运营的快速判断。
- 版本、时间、ID 等三级信息在多页面使用接近标题级的面积和对比度。
- 同一业务步骤被多个嵌套卡片切割；应优先使用 section、divider、metadata list。

## 本轮修改范围

1. Layout token、暖灰 Light token、统一控件/卡片尺寸。
2. `PageContainer`、`MetricCard`、`FilterBar`、`ActionBar`、`MetadataList` 公共层。
3. Dashboard：核心 KPI、运行环境、快捷入口和图表网格重排。
4. Audit/Reviews/Rules/Evals/Monitoring/Settings：通过统一 Grid、控件、卡片和响应式规则收敛，不改业务数据或权限。
5. 为关键页面建立 Light/Dark、Desktop/Narrow 视觉检查记录。
