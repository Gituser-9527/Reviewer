# Rules

版本化 YAML 招聘合规规则目录。当前中国大陆初始规则位于 `cn-mainland/`，由
`@job-compliance/core` 中的 `YamlRuleEngine` 加载。

## 文件格式

```yaml
jurisdiction: CN_MAINLAND
ruleVersion: '1.0.0'
rules:
  - id: CN_EXAMPLE_001
    category: PLATFORM_POLICY
    severity: medium
    action: manual_review
    containsAny:
      fields: [rawText, normalizedText]
      values: [示例关键词]
    regex:
      fields: [rawText]
      patterns: ['示例.{0,4}表达']
    explanation: 命中后的审慎风险说明。
    suggestion: 可执行的修改建议。
```

规则支持：

- `containsAny`：任一关键词命中即触发
- `regex`：任一正则命中即触发
- `patterns`：`containsAny` 的简写形式
- `severity`：`low`、`medium`、`high`、`critical`
- `action`：`pass`、`reject`、`manual_review`、`allow_with_warning`、`need_more_info`
- `fields`：`rawText`、`normalizedText` 或 `extractedFacts.<field>`

同一条规则同时配置 `containsAny` 和 `regex` 时采用 OR 语义。规则命中只表示存在需要处理的风险信号，不代表法律定性。
