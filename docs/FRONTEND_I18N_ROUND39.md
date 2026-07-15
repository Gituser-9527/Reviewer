# Frontend i18n Round 39

日期：2026-07-01

## 目标

本轮目标是让前端具备稳定的中文 `zh-CN` 与英文 `en-US` 切换能力，并建立后续页面迁移的检查机制。

## 当前 i18n 架构

已使用：

- `next-intl`
- `apps/web/messages/zh-CN.json`
- `apps/web/messages/en-US.json`
- `LanguageProvider`
- `LanguageSwitcher`
- `LegacyLocalizer`

语言选择通过 `localStorage` 持久化，切换语言不会重置当前页面组件状态。

## 本轮完成

1. 补充 `common` message 分组：
   - status
   - actions
   - errors
   - validation
   - toast

2. 补充 `workspacePages` message 分组：
   - Review Queue
   - Settings
   - QA
   - Red Team
   - Appeals

3. 迁移以下页面到 message 文件：
   - `apps/web/app/reviews/page.tsx`
   - `apps/web/app/settings/page.tsx`
   - `apps/web/app/qa/page.tsx`
   - `apps/web/app/red-team/page.tsx`
   - `apps/web/app/appeals/page.tsx`

4. 强化 `npm run check:i18n`：
   - 检查中英文 key 树一致。
   - 排除测试文件中的中文夹具。
   - 对运行时 TS/TSX 中的中文硬编码输出 warning。

5. 保持 API 枚举值不变：
   - `PASS`
   - `REJECT`
   - `MANUAL_REVIEW`
   - `DISCRIMINATION`
   - `FEE_DEPOSIT`
   - 等枚举值继续由前端 `messages.enums` 本地化展示。

6. 清理运行时代码中的旧中文枚举标签：
   - `apps/web/app/audit-view-model.ts` 保留英文 fallback。
   - 主要展示文案改由 `messages.enums` 提供。

## 已具备能力

| 能力 | 状态 |
| --- | --- |
| 中文显示 | 已具备 |
| 英文显示 | 已具备，核心页面较完整 |
| 语言切换持久化 | 已具备 |
| Sidebar / Header 国际化 | 已具备 |
| 页面标题国际化 | 已具备 |
| 风险类型国际化 | 已具备 |
| 审核状态国际化 | 已具备 |
| 严重等级国际化 | 已具备 |
| 日期格式化 | 已通过 `formatDate` 支持 |
| 数字格式化 | 已通过 `formatNumber` 支持 |
| 百分比格式化 | 已通过 `formatPercent` 支持 |
| 缺失 key 检查 | 已具备 |

## 当前检查结果

```bash
npm run check:i18n
```

结果：

- 中英文 key 对齐通过：508 个 key 对齐。
- 仍存在 legacy 页面硬编码中文 warning：411 行。

这类 warning 不阻断 Beta，但 GA 前需要逐步迁移。

## 未完成事项

以下页面仍有较多 legacy 文案，需要后续按页面分批迁移：

- `apps/web/app/rules/page.tsx`
- `apps/web/app/evals/page.tsx`
- `apps/web/app/monitoring/page.tsx`
- `apps/web/app/api-docs/page.tsx`
- `apps/web/app/beta-launch/page.tsx`
- `apps/web/app/beta-trial/page.tsx`
- `apps/web/app/incidents/page.tsx`
- `apps/web/app/pilot/page.tsx`
- `apps/web/app/releases/page.tsx`
- `apps/web/app/uat/page.tsx`
- `apps/web/app/help-center/page.tsx`

## 后续建议

第 40 轮审核工作台升级时，应继续遵守：

1. 不新增硬编码中文。
2. 新增文案先写入 `messages`。
3. API 枚举值保持原样，由前端本地化。
4. Toast、Dialog、Table 列名、空状态、错误状态统一从 message 文件读取。

## 验证命令

```bash
npm run build
npm test
npm run lint
npm run check:i18n
```

本轮执行结果：

- `npm run build`：通过。
- `npm test`：通过，34 个测试文件通过，1 个跳过；108 个测试通过，1 个跳过。
- `npm run lint`：通过。
- `npm run check:i18n`：通过，仍输出 legacy 硬编码中文 warning。
