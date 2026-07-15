# Frontend UX QA Report

日期：2026-07-02

## 结论

前端已达到 Beta 试运行的基础可用标准：核心审核工作台、Dashboard、权限态、敏感操作确认、空状态、加载状态、错误状态、长文本展示和中英文 key 对齐均已覆盖。

当前建议：可以进入受控 Beta，但 GA 前必须继续清理 legacy 页面硬编码文案，并接入真实浏览器级 UI / Lighthouse 自动化。

## 检查范围

- Dashboard 总览
- Audit 岗位审核工作台
- Review 人工复核
- Rules 规则运营
- Evaluation 评估中心
- Monitoring 监控中心
- Appeals 申诉复审
- QA 质检中心
- Settings 设置
- 权限态、空状态、加载状态、错误状态
- 表格搜索、筛选、分页
- 敏感操作确认 Dialog
- 长文本展示和移动端响应式

## 已通过项目

| 项目 | 结果 | 说明 |
| --- | --- | --- |
| 构建 | 通过 | `npm run build` 通过 |
| 单元测试 | 通过 | 34 个测试文件通过，1 个跳过；108 个测试通过，1 个跳过 |
| Lint | 通过 | `npm run lint` 通过 |
| i18n key 对齐 | 通过 | 591 个 key 对齐；仍有 385 行 legacy warning |
| UI smoke | 通过 | `npm run test:ui` 通过 |
| 权限无访问页 | 通过 | 展示角色、所需权限、当前权限 |
| 敏感操作确认 | 通过 | 规则发布、回滚、强制发布、灰度创建/回滚、人工复核结论 |
| 长岗位文本 | 通过 | 审核工作台原文、改写、依据区域有滚动和换行保护 |
| 表格体验 | 通过 | Dashboard、Monitoring、Rules 具备搜索/筛选/分页 |
| API 错误提示 | 通过 | 主要工作台使用 ErrorState / error-message |

## 已修复问题

1. Monitoring 页硬编码中文文案已迁移到 `messages.workspacePages.monitoring`。
2. UI smoke 脚本已扩大覆盖：
   - 主要页面存在性
   - AppShell / RoleBasedSidebar
   - ProtectedRoute 权限说明
   - SensitiveActionDialog
   - DataTable 分页
   - Evidence Drawer
   - 响应式与暗色模式预留样式
3. 无权限页新增权限解释面板，避免测试角色时只能看到笼统拒绝提示。

## 前端缺陷清单

| ID | 严重级别 | 状态 | 问题 | 建议 |
| --- | --- | --- | --- | --- |
| FE-I18N-001 | Medium | Open | `check:i18n` 仍发现 385 行 legacy TS/TSX 中文硬编码 warning，主要在 Rules、API Docs、Beta、UAT、Help Center 等旧页面 | GA 前按页面迁移到 message key |
| FE-UI-001 | Medium | Open | Evaluation 页仍是 legacy 交互，未完全统一为 DataTable + i18n 结构 | 第 44 轮或单独任务迁移 |
| FE-A11Y-001 | Low | Open | 当前只做基础语义和静态检查，未接入 axe / Playwright 可访问性扫描 | 引入浏览器级 a11y smoke |
| FE-PERF-001 | Low | Open | 本轮未接入真实 Lighthouse CI，仅使用 Next build 和静态 smoke 作为基础性能信号 | 后续接入 Lighthouse CI 或 Playwright + lighthouse |
| FE-TOAST-001 | Low | Open | 当前关键操作多用 `success-message` 页面提示，尚未统一为全局 Toast 队列 | 后续统一 Toast service |

## 当前可运行命令

```bash
npm run build
npm test
npm run lint
npm run check:i18n
npm run test:ui
```

## 验收判断

Beta 可用：是，建议受控启用。

限制条件：

- Beta 使用人员需要接受已知限制说明。
- 不建议把 legacy 页面作为英文演示重点。
- 发布到更大范围前，应补齐真实浏览器 UI 自动化和 Lighthouse CI。
