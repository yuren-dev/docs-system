---
id: architecture/modules/README
title: 模块契约索引
owner: "{{OWNER}}"
status: active
tier: 3
last_reviewed: "{{DATE}}"
review_interval_days: 180
---

# 模块契约索引

> 每个值得被独立理解的模块（深模块）一份契约。契约回答四件事：
> **它是什么、边界在哪、怎么调、什么不能做。**

| 模块 | 契约 | owner | 状态 |
|---|---|---|---|
| billing/invoice | `billing-invoice.md`（创建后改为链接） | {{OWNER}} | draft |

## 什么时候需要一份契约

- 有其他模块/团队调用它
- 它有必须成立的不变量
- 它经常被 agent 改错（说明边界不清）

## 新建契约

复制 `../_templates/module-contract.md`，放到本目录，文件名用 `模块路径.md`（`billing-invoice.md`），
然后在 `../../index.md` 和本表登记。
