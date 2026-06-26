# Beta Go / No-Go Checklist

## Go 条件

- 核心审核流程可用：岗位输入到 AuditResult 全链路可跑通。
- 审核员已阅读 `docs/REVIEW_SOP.md` 和 `docs/LABELING_GUIDELINE.md`。
- 日志、反馈和导出内容默认脱敏。
- 高风险结论包含 ruleId 或 evidenceId。
- 已配置升级处理负责人和响应时限。
- 已确认 `docs/KNOWN_LIMITATIONS.md`。

## No-Go 条件

- build/test/lint 不通过。
- LLM 或 RAG 失败时系统默认通过。
- 无法追踪审核使用的 ruleVersion / lawKbVersion。
- Beta 参与人员未明确角色。
- 未配置问题反馈入口。
- 合规负责人未确认试运行边界。

## 检查状态

后台 `/beta-launch` 的 Go / No-Go 检查表记录：

- `pending`
- `pass`
- `fail`
- `waived`

必选项不得在 `pending` 或 `fail` 状态下进入扩大试点。
