# Knowledge

本目录保存经人工维护的合规依据摘要，供 `LocalKnowledgeRetriever` 检索。

- `laws/cn-mainland/`：中国大陆法规摘要，必须附官方来源 URL。
- `platform-rules/`：项目内部平台规则，必须明确其不属于外部法规或平台条款。
- Markdown 使用 YAML front matter 描述 `id`、`title`、`sourceType`、`url`、`version`、`categories` 和 `keywords`。
- JSON 可以保存单个知识对象或对象数组，字段与 Markdown front matter 相同，并额外提供 `quote`。

正文是人工维护摘要，不应冒充法规原文。新增或更新生产知识前，应由合规或法务人员核验来源、版本和摘要准确性。
