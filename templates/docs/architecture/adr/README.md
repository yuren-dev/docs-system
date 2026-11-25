---
id: architecture/adr/README
title: 架构决策记录
owner: "{{OWNER}}"
status: active
tier: 3
last_reviewed: "{{DATE}}"
review_interval_days: 365
---

# 架构决策记录（ADR）

> ADR 记录**为什么**，不记录怎么做。一旦 Accepted 就冻结，改主意写新 ADR 并在两者间互相链接。

## 规则

1. 编号连续：`ADR-0001-title.md`，标题用 kebab-case。
2. 状态：`Proposed` → `Accepted` / `Rejected`；`Accepted` 只能变 `Superseded by ADR-00xx`。
3. 已 Accepted 的 ADR **禁止编辑正文**（CI 会检查）；补充信息写在新的 ADR 里。
4. 一个决策一个文件，不要合并。

## 何时必须写

- 引入/更换依赖、存储、消息中间件
- 改鉴权、权限模型、多租户隔离方式
- 改公共接口契约或数据模型
- 选择"明显有代价"的方案（性能换简单性等）

## 索引

| 编号 | 标题 | 状态 | 日期 |
|---|---|---|---|
| [0001](0001-example.md) | <示例：选择 PostgreSQL 作为主存储> | Accepted | {{DATE}} |
