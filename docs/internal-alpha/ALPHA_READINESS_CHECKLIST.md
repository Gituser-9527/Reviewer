# Internal Alpha Readiness Checklist

## 使用方式

本清单用于受控内部 Alpha 启动前的门禁核验。每项由指定维护人员填写状态、负责人、核验时间和脱敏证据位置；不得在本文件、截图、反馈或日志中记录 Token、API Key、数据库 URL、用户账号或真实 extension ID。

状态只能填写：`READY`、`NOT READY`、`NOT VERIFIED`。任何 `NOT READY` 或 `NOT VERIFIED` 的必填项都不得进入真人 Pilot。

## Alpha 目标与边界

本阶段是面向指定维护人员、内部审核员和观察员的受控内部 Alpha，用于验证人工辅助的岗位审核流程。

它不是公开发布、浏览器商店发布，也不是无人监督的自动决策系统。审核结果是可解释的辅助意见；岗位处置和业务决策由人工负责。

## 安全边界确认

| 检查项 | 要求 | 状态 | 负责人 | 核验时间 | 脱敏证据位置 |
| --- | --- | --- | --- | --- | --- |
| ASSIST 模式 | 扩展只支持人工操作；不得将结果作为自动业务动作。 | `NOT VERIFIED` |  |  |  |
| 人工提交审核 | 每次审核均须由用户明确点击提交。 | `NOT VERIFIED` |  |  |  |
| 人工查看 Finding | 用户在 Popup 中人工查看 Decision、Risk 和 Finding。 | `NOT VERIFIED` |  |  |  |
| 禁止自动审核 | 页面变化、提取或恢复不得自动提交审核。 | `NOT VERIFIED` |  |  |  |
| 禁止自动高亮 | 高亮只能由用户明确触发，且可人工清除。 | `NOT VERIFIED` |  |  |  |
| 禁止自动操作招聘网站 | 扩展不得自动点击、填写、提交或修改招聘页面。 | `NOT VERIFIED` |  |  |  |

## API Environment

| 检查项 | 检查方法 | 状态 | 负责人 | 核验时间 | 脱敏证据位置 |
| --- | --- | --- | --- | --- | --- |
| Alpha API origin | 在受控环境记录目标 origin，并以 health 端点验证可达性；不记录完整内部 URL。 | `NOT VERIFIED` |  |  |  |
| HTTPS / 访问控制 | 确认部署方式符合内部安全要求，认证未被关闭或绕过。 | `NOT VERIFIED` |  |  |  |
| 环境隔离 | 确认 Alpha 不使用生产 API、生产数据库或生产 tenant。 | `NOT VERIFIED` |  |  |  |

## Database

| 检查项 | 检查方法 | 状态 | 负责人 | 核验时间 | 脱敏证据位置 |
| --- | --- | --- | --- | --- | --- |
| PostgreSQL migration | 维护人员在指定 Alpha 环境完成 migration，并记录脱敏执行结果。 | `NOT VERIFIED` |  |  |  |
| tenant 隔离 | 使用专用 Alpha tenant 验证审核数据按 tenant 持久化，不复用生产 tenant。 | `NOT VERIFIED` |  |  |  |
| 数据保留与清理策略 | 确认保留期、批准的存储位置、清理责任人及审计记录例外。 | `NOT VERIFIED` |  |  |  |

## Authentication

| 检查项 | 检查方法 | 状态 | 负责人 | 核验时间 | 脱敏证据位置 |
| --- | --- | --- | --- | --- | --- |
| 最小权限账号 | 确认试用角色仅具备其任务所需权限。 | `NOT VERIFIED` |  |  |  |
| 短期凭据 | 确认凭据绑定专用 tenant、具备到期或撤销安排，且不使用生产管理员凭据。 | `NOT VERIFIED` |  |  |  |
| 凭据保管方式 | 确认凭据仅经批准的安全渠道提供；不得写入 Git、聊天、URL、截图或反馈。 | `NOT VERIFIED` |  |  |  |

## Browser Extension

| 检查项 | 检查方法 | 状态 | 负责人 | 核验时间 | 脱敏证据位置 |
| --- | --- | --- | --- | --- | --- |
| 精确 extension origin | 维护人员根据受控浏览器加载后的 extension ID 配置精确 Origin；不得使用 wildcard。 | `NOT VERIFIED` |  |  |  |
| Manifest 权限 | 对照已发布 Manifest 核验权限未扩大；不为 Alpha 新增权限。 | `NOT VERIFIED` |  |  |  |
| 安装来源 | 确认仅在受控内部机器以批准的 unpacked extension 方式安装。 | `NOT VERIFIED` |  |  |  |

## Test Scope

| 检查项 | 检查方法 | 状态 | 负责人 | 核验时间 | 脱敏证据位置 |
| --- | --- | --- | --- | --- | --- |
| 允许测试网站范围 | 明确批准的站点、页面类型和测试时间窗；使用脱敏记录。 | `NOT VERIFIED` |  |  |  |
| 禁止测试网站范围 | 明确禁止的站点、生产页面、含真实候选人数据的页面及未批准页面。 | `NOT VERIFIED` |  |  |  |
| 测试数据处理 | 确认不上传完整 HTML、不读取 Cookie，并对截图、反馈和日志进行脱敏。 | `NOT VERIFIED` |  |  |  |

## Human Verification

| 检查项 | 检查方法 | 状态 | 负责人 | 核验时间 | 脱敏证据位置 |
| --- | --- | --- | --- | --- | --- |
| 维护人员审核 | 维护人员完成一次受控真实审核，核对 YAML 规则、tenant 归属、Finding 和审计记录。 | `NOT VERIFIED` |  |  |  |
| 内部用户反馈 | 指定反馈渠道、反馈模板和响应责任人；反馈不得含敏感信息。 | `NOT VERIFIED` |  |  |  |
| 问题升级流程 | 确认停止条件、暂停责任人、凭据撤销和 tenant 暂停流程可执行。 | `NOT VERIFIED` |  |  |  |

## 结论

- 当前结论：`NOT VERIFIED`
- 未完成或失败项：
- 下一位处理人：
- 下次复核时间：

仅当所有必填项为 `READY`，并由维护人员填写 [ALPHA_GO_NO_GO_TEMPLATE.md](./ALPHA_GO_NO_GO_TEMPLATE.md) 的 Go 决策后，才可进入受控真人 Pilot。
