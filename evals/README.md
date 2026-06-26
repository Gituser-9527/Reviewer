# Evaluations

本目录保存招聘岗位合规审核 Agent 的离线评估集和评估脚本。样本均为人工合成，不包含真实企业或候选人数据。

## 数据集

- `datasets/job-posting-cases.jsonl`
- 当前包含 55 条 JSONL 样本。
- 覆盖正常岗位、性别限制、婚育限制、入职收费、押金、培训贷、虚假高薪、个人信息过度收集、岗位信息不完整、多风险混合和边界样本。

每行格式：

```json
{
  "id": "case_001",
  "input": {
    "title": "行政专员",
    "description": "限女性，已婚已育优先，入职缴纳500元服装费"
  },
  "expected": {
    "decision": "REJECT",
    "categories": ["DISCRIMINATION", "FEE_DEPOSIT"],
    "minRiskLevel": "critical"
  }
}
```

## 运行

```bash
npm run eval
npm run eval:real
npm run eval:dataset -- --datasetId=real_local
```

脚本会先构建 packages，然后调用 `auditJobPosting` 执行本地规则引擎和本地 RAG evidence 检索，默认不调用真实 LLM。

### 真实脱敏样本评估

`npm run eval:real` 面向本地 JSONL 文件，默认读取 `evals/datasets/job-posting-cases.jsonl`。真实样本应先完成脱敏，再通过 `--file` 指定：

```bash
npm run eval:real -- --file=evals/datasets/real-redacted-job-cases.jsonl --datasetId=real_2026_q2
```

可选参数：

- `--ruleVersion=1.0.0`
- `--lawKbVersion=local-2026-06-12`
- `--modelVersion=mock`
- `--persist`：当 `DATABASE_URL` 已配置时，将数据集、样本和运行结果写入 PostgreSQL。
- `--strict`：存在失败样本时以非 0 退出，适合规则发布门禁。

`npm run eval:dataset -- --datasetId=xxx` 优先从数据库读取指定数据集并保存运行结果；未配置 `DATABASE_URL` 时会回退读取本地 JSONL，便于开发环境自测。

输出字段：

- `total`
- `passed`
- `failed`
- `accuracy`
- `categoryRecall`
- `decisionAccuracy`
- `categoryPrecision`
- `criticalRecall`
- `falsePositiveRate`
- `falseNegativeRate`
- `manualReviewRate`
- `evidenceAccuracy`
- `rewriteSafetyRate`
- `failedCases`

当存在失败样本时，脚本会输出每个失败 case 的原因，并以非 0 退出码结束，便于后续接入 CI。
