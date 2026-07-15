# Adapter 版本管理

每次 selector、页面匹配或提取语义变化必须提高 Adapter 版本，并记录适用域名、Fixture 回归结果、已知限制与页面指纹变动。Registry 根据 Adapter 自身 `supports` 结果排序选择，通用 Adapter 始终是最后兜底。
