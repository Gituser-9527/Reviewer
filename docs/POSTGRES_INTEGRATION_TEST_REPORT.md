# PostgreSQL integration test report

CI now contains `postgres-integration-test`, with an isolated PostgreSQL 16 service and non-production credentials. Local execution requires:

```powershell
Copy-Item .env.test.example .env.test
npm run test:db:up
npm run test:db:wait
npm run test:db:migrate
npm run test:postgres
```

At report time, local execution was blocked by `TEST_DATABASE_URL_MISSING`; no database test was represented as passed.
