---
id: archive/README
title: 归档索引
owner: "{{OWNER}}"
status: active
tier: 3
last_reviewed: "{{DATE}}"
review_interval_days: 180
---

# 归档索引

> 归档不是垃圾桶：每份归档文档都必须说明**为什么归档**和**该看哪份新文档**。
> 归档区只读，CI 会阻止修改；这里的内容不得作为实现依据。

## 归档清单

| 归档文档 | 原因 | 替代文档 | 归档日期 | 保留至 |
|---|---|---|---|---|
| <示例> | superseded | <新文档> | {{DATE}} | {{DATE}} |

## 归档操作

1. 把文件移到 `archive/<年份>/<原相对路径>`，保留原目录结构。
2. 修改 front-matter：

```yaml
status: archived
archived_at: YYYY-MM-DD
archived_reason: superseded   # superseded | obsolete | consolidated | compliance-retention
superseded_by: docs/新文档.md
retain_until: YYYY-MM-DD
```

3. 在正文顶部加一句归档说明，指向替代文档。
4. 从上表登记，并从 `../index.md` 移除条目。
5. 配置旧 URL 的重定向（如使用文档站）。

## 保留期

| 类型 | 保留期 | 到期动作 |
|---|---|---|
| 合规 / 合同 / 审计 | 7 年 | 转只读冷存储 |
| 技术文档 / 旧规格 | 2 年 | 复审后删除 |
| Task Brief / 笔记 | 90 天 | 直接删除（git 即归档） |
