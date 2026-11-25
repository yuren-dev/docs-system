---
id: _meta/CONVENTIONS
title: 文档规范
owner: "{{OWNER}}"
status: active
tier: 3
last_reviewed: "{{DATE}}"
review_interval_days: 180
index: false
---

# 文档规范

> 这份文件是本仓库文档系统的"宪法"。改规则改这里，并同步 `scripts/docs-tool.mjs` 的校验。

## 1. 分层：按腐化速度分级

| 层级 | 文档 | 失效后果 | 复核周期 | 更新触发 |
|---|---|---|---|---|
| T1 | runbook、发布/回滚、安全 | 直接故障 | 30–90 天 | 系统或流程任何变更 |
| T2 | 模块契约、数据模型、配置 | 改错地方 | 90–180 天 | 对应代码变更 |
| T3 | 规格、术语、架构全景 | 方向跑偏 | 180 天 / 每版本 | 需求或架构变更 |
| T4 | ADR、事故复盘 | 误导决策 | 不复核 | 只被新 ADR 取代 |

**ADR 永不编辑。** 结论变了就写新 ADR，旧的状态改为 `Superseded by ADR-00xx`。

## 2. 必备 front-matter

```yaml
---
id: architecture/modules/billing-invoice   # 全局唯一
title: Invoice 模块契约
owner: "@team-payments"                    # 必须真实存在
status: active                             # draft|active|stale|deprecated|archived
tier: 2                                    # 1-4
last_reviewed: 2026-11-01                  # 上次验证日期
review_interval_days: 90                   # 到期进入复核队列
source_of_truth: ["src/billing/invoice/**"] # 可选：本文档描述哪些代码
verified_by: "pnpm test src/billing/invoice" # 可选：复核时执行的命令
---
```

- `index: false` → 不要求登记到 `docs/index.md`（默认都需要）。
- `_` 开头的目录不参与检查（模板、草稿、工具）。
- 归档文档额外要求 `archived_at`、`superseded_by` 或 `archived_reason`。

## 3. 状态机

```
draft → active → stale → deprecated → archived
            ↑_______|  （复核后可复活）
```

| 状态 | 含义 | 页面表现 |
|---|---|---|
| `active` | 已验证，可信 | 正常 |
| `stale` | 可能过时，待复核 | 黄色横幅，搜索降权 |
| `deprecated` | 有替代品 | 红色横幅 + 替代链接 |
| `archived` | 冻结，仅追溯 | 灰色横幅，移出索引与搜索 |

## 4. 更新规则

1. **活文档原地改**，不要 `-v2`、`-final` 副本。历史由 git 保存。
2. 语义变化写进文末 `## 变更记录` 表（只记"含义变了"，错字不记）。
3. **承诺 / 合规 / 对外契约**才版本化：冻结旧文件，新建 `v2`。
4. 代码 → 文档的耦合写进根目录 `docs.map.yaml`；改了 source 没改 doc，CI 会拦。
5. 破坏性变更：新增 ADR + 迁移说明，并在相关模块契约中标注。

## 5. 归档

- 移动而非删除：`docs/archive/<年份>/<原相对路径>`。
- 必填 `archived_at`、`archived_reason`、`superseded_by`。
- 归档区只读，CI 阻止修改；从 `index.md` 移除，在 `archive/README.md` 登记。
- `retain_until` 到期后季度清理：删除或转冷存储。

## 6. 复核协议（每份 10 分钟）

1. 跑 `verified_by`，失败 → `stale`。
2. 只校 3 条承重断言（接口、不变量、权限），不必通读。
3. 三选一：确认（bump `last_reviewed`）/ 更新 / 降级。
4. 复核方式写进 PR 描述，便于抽查。

## 7. 命令

```bash
node scripts/docs-tool.mjs check            # front-matter、索引、链接、代码路径
node scripts/docs-tool.mjs drift --base origin/main   # PR 漂移检查
node scripts/docs-tool.mjs audit --strict   # 过期报告；T1/T2 过期则失败
node scripts/docs-tool.mjs audit --write    # 生成 docs/_meta/audit.md
```

## 8. 不做什么

- 不维护文档站多版本（内部文档）。
- 不用文档数量/字数考核。
- 不保留"看起来还有效"的过期文档：要么更新，要么归档。
