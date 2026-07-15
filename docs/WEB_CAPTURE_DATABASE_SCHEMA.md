# 网页采集数据库 Schema

迁移 `0021_web_capture_extension.sql` 新增 `web_captures`、`web_capture_field_corrections`、`extension_authorizations`，并为 `audit_runs.web_capture_id` 增加外键与索引。所有数据表均以 `tenant_id` 为必选查询条件；采集与修正使用追加历史，审核记录不被覆盖。
