# PostgreSQL 测试数据库

测试库与开发库隔离：`postgresql://test_user:test_password@localhost:5433/job_compliance_test`。

```powershell
npm run test:db:up
npm run test:db:wait
$env:TEST_DATABASE_URL='postgresql://test_user:test_password@localhost:5433/job_compliance_test'
npm run test:db:migrate
npm run test:postgres
npm run test:db:down
```

`npm run test:postgres` 在没有 `TEST_DATABASE_URL` 时会失败，不会把 skipped 当作通过。Docker 未安装或未启动时，启动命令会给出明确错误。
