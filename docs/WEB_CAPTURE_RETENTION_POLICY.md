# 网页采集数据保留策略

默认策略：采集字段保留 180 天，脱敏 `mainText` 保留 7 天，URL 移除 query 与 fragment 后保存并计算哈希。不得保存 HTML、Cookie、Storage、Authorization、CSRF、密码或截图。清理入口为 `npm run cleanup:web-captures -- --dry-run [--tenant tenant_id]`；生产实现应使用 PostgreSQL Repository 执行并写入追加式操作日志。
