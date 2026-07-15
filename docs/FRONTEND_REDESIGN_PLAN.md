# Frontend Redesign Plan

阶段：V3.1 第 38 轮  
主题：设计系统与整体视觉重构  
日期：2026-07-01

## 当前前端结构检查

当前前端位于 `apps/web/`，使用：

- Next.js App Router
- React
- TypeScript
- 自研 CSS 设计层：`apps/web/app/styles.css`
- 自研组件：`apps/web/app/components/`
- i18n message 文件：`apps/web/messages/zh-CN.json`、`apps/web/messages/en-US.json`
- 前端权限层：`apps/web/app/auth/`

主要页面包括：

- `/overview` Dashboard 总览
- `/` Audit 岗位审核工作台
- `/reviews` Review 人工复核
- `/rules` Rules 规则运营
- `/evals` Evaluation 评估中心
- `/monitoring` Monitoring 监控灰度
- `/settings` Settings 设置

扩展页面包括 Red Team、Releases、Appeals、QA、UAT、Incident、Beta、Pilot、Help Center、API Docs 等。

## 组件库评估

当前尚未接入 Tailwind CSS、shadcn/ui、TanStack Table。

已有能力：

- `AppShell`
- `RoleBasedSidebar`
- Header
- `PageContainer`
- `StatCard`
- `RiskBadge`
- `EmptyState`
- `LoadingState`
- `ErrorState`
- `SkeletonPanel`
- `DataTable`
- `PermissionGate`
- `ProtectedRoute`
- `SensitiveActionDialog`

本轮决策：

- 暂不引入 Tailwind / shadcn / TanStack Table，避免在一个回合里改动过大。
- 先把现有自研组件层规范化，建立稳定 API 和视觉 token。
- 后续如要接入 shadcn/ui，应以 ADR 形式记录迁移策略。

## 本轮目标完成情况

| 目标 | 状态 | 说明 |
| --- | --- | --- |
| 检查当前前端目录结构 | 已完成 | 已确认 App Router 页面和组件分布 |
| 评估是否使用组件库 | 已完成 | 当前为自研组件，无 Tailwind/shadcn/TanStack |
| 建立统一 AppShell/Sidebar/Header/PageContainer | 已具备 | 当前由 `AppShell`、`RoleBasedSidebar`、`PageContainer` 承担 |
| 建立统一 Button/Card/Badge/Table/Dialog/Toast 风格 | 已完成基础层 | 新增 `Button`、`Card`、`Badge`、`TableShell`、`Dialog`、`Toast` |
| 建立风险颜色体系 | 已完成 | 新增 risk color tokens，并与现有 `RiskBadge` 保持一致 |
| 重构主要页面为统一后台布局 | 部分完成 | 主要页面已受 AppShell 统一包裹；逐页组件化迁移留到后续轮次 |
| 不改变后端 API | 已遵守 | 本轮无后端 API 改动 |
| 不删除已有功能 | 已遵守 | 本轮仅新增设计系统层和文档 |
| build/test 通过 | 已完成 | `npm run build`、`npm test` 通过 |

## 信息架构方向

V3.1 前端将收敛为 7 个主工作区：

1. Dashboard
2. Audit
3. Review
4. Rules
5. Evaluation
6. Monitoring
7. Settings

扩展能力作为工作区内入口或二级页面：

- Red Team 属于 Evaluation
- Releases 属于 Evaluation / Rules
- Appeals 属于 Review
- QA 属于 Review / Evaluation
- Incident 属于 Monitoring
- UAT / Beta 属于 Dashboard / Operations
- Pilot / ROI 属于 Dashboard / Operations

## 分阶段计划

### 第 38 轮：设计系统与整体视觉重构

已完成：

- 统一设计系统基础组件
- 风险颜色 token
- 设计系统文档
- 前端重构计划文档

### 第 39 轮：中英文国际化 i18n

待完成：

- 将主工作区硬编码中文迁移到 message 文件
- 收敛 `LegacyLocalizer`
- 将 `check:i18n` 的 warning 分级管理

### 第 40 轮：审核工作台体验升级

待完成：

- 使用设计系统组件重构 Audit 工作台内部卡片
- 强化 evidence、finding、rewrite、feedback 的信息层级
- 增加统一 ToastProvider

### 第 41 轮：数据看板与后台美化

待完成：

- 用统一 `Card`/`TableShell` 重构 Dashboard、Monitoring、Evaluation
- 接入真实图表组件或保留 CSS chart
- 增强空态和错误态

### 第 42 轮：权限角色下的导航体验

待完成：

- 角色切换体验产品化
- 细化敏感操作确认
- 权限态文案统一

### 第 43 轮：前端质量验收

待完成：

- UI smoke + i18n check 常态化
- 浏览器级测试
- Lighthouse / axe 自动化

## 当前实现说明

本轮没有改动业务 API，也没有迁移页面逻辑。实现重点是搭建稳定设计系统层：

- `apps/web/app/components/ui.tsx`
  - 新增 `Button`
  - 新增 `Card`
  - 新增 `Badge`
  - 新增 `TableShell`
  - 新增 `Dialog`
  - 新增 `Toast`

- `apps/web/app/styles.css`
  - 新增风险颜色 token
  - 新增设计系统组件 class
  - 保持现有旧 class 兼容

## 未完成事项

1. 尚未接入 Tailwind CSS / shadcn/ui / TanStack Table。
2. 主要页面仍有部分旧式 class 和硬编码文案。
3. `Toast` 目前是展示组件，尚未形成全局 `ToastProvider`。
4. `Dialog` 是基础组件，现有 `SensitiveActionDialog` 后续可继续复用或收敛。
5. 扩展页面还未全部迁移到新设计系统组件。
6. 英文体验仍依赖部分 legacy 运行时替换，需第 39 轮继续处理。

## 验证命令

```bash
npm run build
npm test
```

本轮均已通过。
