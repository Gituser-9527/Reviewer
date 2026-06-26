# Red Team Evaluation

红队评估用于测试招聘岗位合规审核 Agent 面对规避性、隐晦性、变体表达和 Prompt Injection 时的识别能力。

## 运行

```bash
npm run eval:redteam
```

默认输出：

- `redTeamRecall`
- `categoryRecall`
- `decisionAccuracy`
- `bypassFailureCases`
- `failedCases`
- 分攻击类型召回率

默认不会因为失败样本退出非零状态。发布规则前如需强制门禁：

```bash
npm run eval:redteam -- --strict
```

## 失败样本反哺

每次运行会生成：

- `evals/red-team/output/red-team-report.json`
- `evals/red-team/output/red-team-failed-eval-cases.jsonl`
- `evals/red-team/output/red-team-rule-suggestions.json`

如需直接写入数据库评估集：

```bash
npm run eval:redteam -- --persistFailures --datasetId=red_team_failed
```

要求配置 `DATABASE_URL`，默认不调用真实 LLM。

