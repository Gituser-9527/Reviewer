# Internal Alpha Go / No-Go Template

> 本模板记录受控内部 Alpha 的启动门禁决策，不记录 Token、API Key、数据库 URL、用户账号、真实 extension ID 或未脱敏页面内容。

## 决策信息

| 字段 | 内容 |
| --- | --- |
| 日期 |  |
| 负责人 |  |
| 环境 | Alpha / 非生产（填写脱敏环境标识） |
| 参与人员 | 仅角色或内部别名 |
| main commit |  |
| 关联清单 | [ALPHA_READINESS_CHECKLIST.md](./ALPHA_READINESS_CHECKLIST.md) 的脱敏记录位置 |
| 决策 | `GO` / `CONDITIONAL GO` / `NO-GO` |

## 检查项目

状态只能填写：`PASS`、`FAIL`、`NOT VERIFIED`。

| 检查项 | 状态 | 负责人 | 脱敏证据位置 | 备注 |
| --- | --- | --- | --- | --- |
| main CI（verify） | `NOT VERIFIED` |  |  |  |
| main CI（postgres-integration-test） | `NOT VERIFIED` |  |  |  |
| Alpha API origin 可达与访问控制 | `NOT VERIFIED` |  |  |  |
| 环境隔离 | `NOT VERIFIED` |  |  |  |
| PostgreSQL migration | `NOT VERIFIED` |  |  |  |
| 专用 Alpha tenant | `NOT VERIFIED` |  |  |  |
| tenant 隔离验证 | `NOT VERIFIED` |  |  |  |
| 最小权限与短期凭据策略 | `NOT VERIFIED` |  |  |  |
| 精确 extension Origin | `NOT VERIFIED` |  |  |  |
| Manifest 权限未扩大 | `NOT VERIFIED` |  |  |  |
| 允许测试范围与测试数据处理 | `NOT VERIFIED` |  |  |  |
| 维护人员受控真实审核 | `NOT VERIFIED` |  |  |  |
| 人工 ASSIST 流程 | `NOT VERIFIED` |  |  |  |
| 反馈与问题升级流程 | `NOT VERIFIED` |  |  |  |
| 数据保留与清理责任 | `NOT VERIFIED` |  |  |  |

## Go 条件

只有同时满足以下条件，才可记录 `GO`：

- main CI 已通过；
- 环境隔离已确认；
- 专用 Alpha tenant 与 tenant 隔离已确认；
- 最小权限、短期凭据和保管策略已确认；
- 人工审核流程已在受控环境完成验证；
- 所有必填检查项均为 `PASS`，且不存在未处置的安全风险。

`CONDITIONAL GO` 只能用于不影响安全、隔离、认证、tenant 归属或人工控制的已登记限制，并必须写明范围、到期时间和暂停条件。任何安全必填项为 `FAIL` 或 `NOT VERIFIED` 时不得记录 `GO`。

## No-Go 条件

出现以下任一情况必须记录 `NO-GO`，暂停试用并按升级流程处理：

- 出现自动决策、自动审核、自动高亮或自动操作招聘网站的风险；
- 发生或疑似发生数据泄露、Token 暴露、Cookie 读取或完整 HTML 上传；
- 权限异常、认证绕过、CORS 异常或不精确 Origin 配置；
- tenant 隔离失败、跨 tenant 数据可见或审核记录归属错误；
- `STALE` 结果仍可提交或高亮，或旧岗位结果被用于当前岗位；
- API、数据库或审计链路不稳定，无法由人工安全识别和处置。

## 决策记录

### 结论与理由


### 已知限制与补救措施


### Pilot 范围、暂停条件与复核时间


### 批准记录

| 角色 | 姓名或内部别名 | 时间 | 结论 |
| --- | --- | --- | --- |
| Alpha 维护负责人 |  |  |  |
| 安全 / 平台负责人（如适用） |  |  |  |
