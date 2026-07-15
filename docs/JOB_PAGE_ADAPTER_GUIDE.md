# Job Page Adapter 指南

每个 Adapter 实现共享的 `JobPageAdapter`，由 `AdapterRegistry` 集中注册。站点选择器、页面特征和字段定位必须封装在 Adapter 内，禁止散落到 Side Panel 或审核业务组件。

`supports` 只能基于当前 `PageContext` 判断；`extract` 只能读取已经采集的页面数据；`locateField` 仅返回高亮定位；`detectNextAction` 仅供未来展示建议，不能操作 DOM。Adapter 必须给出稳定 `id`/`version`、字段来源/置信度、失败警告，并有正例、反例和页面变动降级测试。

通用 Adapter 是保守兜底：优先读取 JSON-LD `JobPosting`，否则将页面标题和主要文本作为低置信度结果。新增真实平台 Adapter 前须获得平台范围、用户授权、合规审批与可维护 Fixture。
