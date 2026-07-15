# 风险原文高亮设计

高亮先使用采集字段 Locator，再使用 Finding 的 `matchedText` / Evidence `quote` 精确或归一化文本匹配。仅唯一命中才允许标记；多命中、页面变化或低置信度均在侧边栏降级为“未定位”，不得错误高亮。高亮应由 Content Script 的扩展专属样式创建，并可在页面变更时完全清理。
