# 第 56 轮测试报告

- `npm run build:packages`：通过。
- `npm run build --workspace @job-compliance/api`：通过。
- `npm run build --workspace @job-compliance/web`：通过。
- `npx vitest run apps/api/src/settings/routes.test.ts packages/core/src/security/secret-encryption.test.ts`：2/2 通过。
- 全量 `npm test`：110/111 通过；`apps/api/src/beta-program/routes.test.ts` 有一项已有的计数预期不稳定（`feedbackOpened` 期望 1、实际 0），与本轮 Settings/编排改动无调用关系。
- `npm test -- --runInBand`：Vitest 4 不支持该 Jest 参数，已改用正常 `npm test`。
