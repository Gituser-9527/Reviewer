# Layout Visual QA Report

日期：2026-07-15

## 覆盖矩阵

| 页面 | Light Desktop | Dark Desktop | Light Narrow | Dark Narrow |
| --- | --- | --- | --- | --- |
| Dashboard | 通过静态布局断言 | 通过 token 继承检查 | 通过 4→2→1 Grid 断点检查 | 通过 token 继承检查 |
| 岗位审核 | 通过 Split Pane 检查 | 通过 token 继承检查 | 单列降级检查 | 通过 token 继承检查 |
| 人工复核 | 三栏比例检查 | 通过 token 继承检查 | 单列降级检查 | 通过 token 继承检查 |
| 规则、评估、监控 | 侧栏/主体比例检查 | 通过 token 继承检查 | 单列与表格滚动检查 | 通过 token 继承检查 |
| 设置 | 共享卡片/控件检查 | 通过 token 继承检查 | gutter 检查 | 通过 token 继承检查 |

## 自动检查

- `npm run test:layout`：验证布局 token、MetricCard、运行环境合并、响应式 Grid。
- `npm run test:ui`：验证主要页面、状态、权限、响应式和数据表基础能力。
- `npm run build --workspace @job-compliance/web`：验证静态页面与 TypeScript。

## 截图说明

本仓库当前未安装 Playwright，且测试指引指定的 `scripts/with_server.py` 不存在，故本轮未生成可重复的浏览器截图基线。已保留四种视口/主题的验收矩阵与 CSS 断点断言；后续接入 Playwright 后，应将该矩阵固化为 PNG 快照回归测试。
