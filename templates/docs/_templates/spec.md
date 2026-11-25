---
id: _templates/spec
title: 规格模板
owner: "{{OWNER}}"
status: draft
tier: 4
index: false
---

# Spec: <变更名称>

<!-- 复制到 docs/specs/YYYY-MM-主题.md，登记到 specs/README.md 与 index.md。 -->

- 状态：draft
- 关联：<issue / ADR>
- 目标版本：<...>

## 问题

<现在哪里不对，谁受影响，为什么必须现在做。>

## 范围

- 做：<...>
- 不做：<...>

## 验收标准

> 必须可执行，写成 Given/When/Then 或可勾选的断言。

- [ ] Given <前置>，When <动作>，Then <可观测结果>
- [ ] <并发/边界/失败路径各至少一条>

## 影响面

| 模块 | 需要的改动 | 文档是否需同步 |
|---|---|---|
| <...> | <...> | <契约 / ADR / 无> |

## 上线与回滚

- 上线顺序：<...>
- 回滚条件：<...>
