---
id: runbooks/README
title: 运维手册索引
owner: "{{OWNER}}"
status: active
tier: 2
last_reviewed: "{{DATE}}"
review_interval_days: 90
---

# 运维手册索引

> T1 文档：写错会直接导致故障。每条步骤都必须能照着执行，命令要可复制。

| 手册 | 场景 | 最后验证 |
|---|---|---|
| [部署](deploy.md) | 发布与回滚 | {{DATE}} |

## 写作规则

- 每份手册标注 `verified_by`（可执行的冒烟命令），复核时真跑一次。
- 步骤写成编号命令，不写"适当调整""根据情况"。
- 有破坏性操作时，写清"什么情况下**不要**执行"。
