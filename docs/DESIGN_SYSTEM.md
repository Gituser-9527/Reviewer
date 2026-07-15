# Design System

阶段：V3.1 第 38 轮  
适用范围：招聘合规审核 Agent 前端后台

## 设计目标

前端视觉定位为成熟 SaaS 后台，而不是一次性脚手架页面。

设计系统需要支撑：

- 审核员快速判断风险
- 合规经理查看规则、发布和回滚
- 运营人员查看 Dashboard、监控和评估
- 不同角色只看到自己可操作的内容
- 中文和英文界面一致
- 长岗位文本、证据、规则、评估失败样本不会撑破页面

## 设计原则

1. 风险优先：高风险信息必须比普通数据更醒目。
2. 证据可读：Finding、Evidence、RuleId、Version 必须容易扫描。
3. 操作克制：发布、回滚、强制发布等操作必须二次确认。
4. 可扩展：页面使用统一 Shell、Card、Table、Dialog、Toast。
5. 可国际化：新增页面文案应优先进入 message 文件。
6. 可降级：API 失败、无数据、权限不足时必须有明确状态。

## 视觉 Token

### 基础颜色

| Token | 用途 |
| --- | --- |
| `--bg` | 应用背景 |
| `--surface` | 半透明卡片背景 |
| `--surface-solid` | 实色卡片背景 |
| `--surface-muted` | 弱化区域背景 |
| `--border` | 默认边框 |
| `--border-strong` | 强边框 |
| `--text` | 主文字 |
| `--text-muted` | 辅助文字 |
| `--text-soft` | 弱提示文字 |
| `--brand` | 品牌主色 |
| `--accent` | 强调色 |

### 风险颜色

| 风险等级 | Token | 背景 Token | 用途 |
| --- | --- | --- | --- |
| NONE | `--risk-none` | `--risk-none-bg` | 无风险、正常状态 |
| LOW | `--risk-low` | `--risk-low-bg` | 低风险、轻提示 |
| MEDIUM | `--risk-medium` | `--risk-medium-bg` | 中风险、警告 |
| HIGH | `--risk-high` | `--risk-high-bg` | 高风险、人工复核 |
| CRITICAL | `--risk-critical` | `--risk-critical-bg` | 严重风险、拦截 |

## 布局组件

### AppShell

文件：`apps/web/app/components/app-shell.tsx`

职责：

- 左侧角色化导航
- 顶部 Header
- 语言切换
- UAT / Kill Switch 快捷入口
- 页面权限保护

### RoleBasedSidebar

职责：

- 根据当前角色权限过滤导航入口
- 显示当前角色
- 开发期支持角色切换

### PageContainer

文件：`apps/web/app/components/ui.tsx`

用于统一页面开头：

- eyebrow
- title
- description
- content

## 基础组件

### Button

变体：

- `primary`
- `secondary`
- `ghost`
- `danger`

使用建议：

- 主流程操作使用 `primary`
- 次要操作使用 `ghost`
- 风险操作使用 `danger`
- 页面内辅助动作使用 `secondary`

### Card

支持：

- eyebrow
- title
- description
- actions
- tone

tone：

- `plain`
- `default`
- `success`
- `warning`
- `danger`
- `info`

### Badge

用于通用状态，不替代风险等级。

tone：

- `default`
- `success`
- `warning`
- `danger`
- `info`

### RiskBadge

用于风险等级和严重程度：

- `none`
- `low`
- `medium`
- `high`
- `critical`

所有风险色应通过 `RiskBadge` 或风险 token 使用，避免页面自行写颜色。

### TableShell

用于承载表格，并提供横向滚动容器。

建议：

- 数据表使用 `DataTable`
- 原生 table 外层使用 `TableShell`
- 长字段必须允许换行或横向滚动

### Dialog

基础对话框组件。

用于：

- 表单确认
- 详情查看
- 二次确认

敏感操作优先使用 `SensitiveActionDialog`。

### Toast

当前为展示组件，后续第 40 轮建议扩展为全局 `ToastProvider`。

用途：

- 保存成功
- 复制成功
- 发布成功
- API 失败提示

## 状态组件

### EmptyState

用于：

- 无数据
- 无权限后可回退
- 评估集为空
- 表格筛选无结果

### LoadingState

用于轻量加载提示。

### SkeletonPanel

用于 Dashboard、结果面板等高密度区域加载中状态。

### ErrorState

用于 API 错误、权限异常、保存失败等。

## 权限组件

### PermissionGate

根据权限隐藏子元素。

注意：

- 只能作为前端体验优化。
- 后端仍必须校验权限。

### ProtectedRoute

无权限访问页面时显示友好提示。

### SensitiveActionDialog

用于敏感操作二次确认。

当前覆盖：

- 规则发布
- 强制发布
- 规则回滚

要求：

- 展示影响范围
- 输入确认文本
- 明确操作后果

## 页面迁移规范

新页面应遵循：

1. 通过 `AppShell` 包裹。
2. 使用 `PageContainer` 作为页面入口。
3. 使用 `Card` 承载模块区域。
4. 表格优先使用 `DataTable` 或 `TableShell`。
5. 风险等级使用 `RiskBadge`。
6. 普通状态使用 `Badge`。
7. 加载使用 `LoadingState` 或 `SkeletonPanel`。
8. 空数据使用 `EmptyState`。
9. 错误使用 `ErrorState`。
10. 敏感操作使用 `SensitiveActionDialog`。

## i18n 规范

新增文案优先写入：

- `apps/web/messages/zh-CN.json`
- `apps/web/messages/en-US.json`

禁止在成熟页面中新增硬编码中文。

允许临时保留：

- MVP 占位页
- 内部开发提示
- 需要第 39 轮迁移的 legacy 文案

检查命令：

```bash
npm run check:i18n
```

## 当前限制

1. 尚未使用 Tailwind CSS。
2. 尚未使用 shadcn/ui。
3. 尚未使用 TanStack Table。
4. Toast 尚未全局化。
5. 旧页面仍有硬编码文案。
6. 暗色模式已有 token 和 CSS 预留，但未逐页视觉验收。

## 后续建议

第 39 轮优先处理 i18n：

- 将主工作区硬编码文案迁移到 message 文件。
- 缩小 `LegacyLocalizer` 依赖范围。
- 为 enum、状态、按钮、表格列名建立统一翻译 helper。

第 40 轮优先处理审核工作台：

- 将 Audit 页面内部卡片迁移到 `Card` / `Button` / `Toast`。
- 增强 Finding / Evidence / Rewrite 的层级和操作反馈。
