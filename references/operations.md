# 运维手册

## 每周（10 分钟）

1. 打开 `Documentation review queue` issue（workflow 自动更新）。
2. 按 tier 从高到低处理；T1 逾期优先，其次 T2。
3. 每份文档走复核协议（见下），三选一：确认 / 更新 / 归档。
4. 确认：`last_reviewed` 改成今天；更新：改内容 + bump；归档：按归档流程。

## 每月（30 分钟）

- 检查孤儿：`git log --format='%ae' -n 200 | sort | uniq -c | sort -rn`，看 owner 是否还存在。
- 看 drift 违规趋势：如果某条映射长期靠 `docs-not-needed` 通过，说明映射错了，删掉或改 sources。
- 合并重复文档：同一事实出现两处就删一处。

## 每季度（半天，只做减法）

- 按 `retain_until` 清理归档。
- 抽查 10 份"刚确认过"的 T1/T2 文档做交叉验证，错误率进复盘（只抽查，不惩罚）。
- 合并重复、删除僵尸、补 3 条缺失的 ADR。
- 合规文档打快照 tag：`git tag docs-snapshot-2026-Q4 && git push --tags`。

## 复核协议（每份 10 分钟）

1. 跑 `verified_by`；失败 → `status: stale`。
2. 只校 3 条承重断言：公共接口签名、不变量、权限/破坏性操作。
3. 检查 `source_of_truth` 路径是否仍存在（`check` 已覆盖）。
4. 处置并记录复核方式（写进 PR 描述或 issue 评论）。

## 归档操作

```bash
mkdir -p docs/archive/2026/architecture/modules
git mv docs/architecture/modules/old.md docs/archive/2026/architecture/modules/old.md
```

然后：

1. front-matter 改 `status: archived`，加 `archived_at`、`archived_reason`、`superseded_by`、`retain_until`。
2. 正文顶部加横幅：

```markdown
> ⚠️ 本文档已于 2026-11-20 归档，内容不再维护。最新版本见 [xxx](../../../specs/xxx.md)。
```

3. 从 `docs/index.md` 删除条目，在 `docs/archive/README.md` 登记。
4. 文档站配置旧路径 301 到 tombstone 页。
5. 跑 `node scripts/docs-tool.mjs check` 确认链接没断。

## 老项目迁移（brownfield）

不要一次全量重写。按周推进：

| 周 | 动作 |
|---|---|
| 1 | `init` 生成骨架；只补 `index.md`、术语表、架构全景三份真实内容 |
| 2 | 给最核心 5 个模块写契约（从代码反推，不追求完美） |
| 3 | 补 3 条历史 ADR（从 git log / PR 里找"为什么"）；建 5 条 docs.map |
| 4 | 接 CI，先 warning 跑两周，再转 blocking |
| 5+ | 每周迁移 2–3 份旧文档：要么更新登记，要么归档 |

旧文档处置规则：仍有效的 → 更新 + 登记；被取代的 → 归档 + `superseded_by`；无人认领且无入链的 → 直接删（git 保留历史）。

## GitLab CI 片段

```yaml
docs:
  image: node:20
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - node scripts/docs-tool.mjs check
    - node scripts/docs-tool.mjs drift --base "origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME"
  allow_failure: false

docs-audit:
  image: node:20
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"
  script:
    - node scripts/docs-tool.mjs audit --write docs/_meta/audit.md
```

GitLab 的归档只读可用 `rules:changes` + 自定义 job 检查 MR 是否修改 `docs/archive/**`，或直接在 `docs-tool.mjs` 的 drift 里传 `--base` 适配。

## 排错

| 现象 | 原因 | 处理 |
|---|---|---|
| `check` 报 "not listed in index.md" | 新文档没登记 | 加到 index，或用 `index: false`（仅模板/元信息） |
| `check` 报 front-matter 缺失 | 新文件没加头部 | 从 `_templates/` 复制 |
| `source_of_truth` matches no file | 代码路径被重构 | 改路径或删掉该字段 |
| `drift` 报 source changed | 映射生效 | 更新文档；确不需要就打 `docs-not-needed` 并写理由 |
| `audit` 长期大量逾期 | 周期设太短或 owner 缺失 | 调整 `review_interval_days`，补 owner |
| 归档文件被拦 | 有人改历史 | 恢复原文件；要改结论就写新文档 |

## 与 agent 协作的额外约定

- 任务开始时让 agent 先读 `docs/index.md` + 模块契约，再动代码。
- 任务结束时要求回填结论：更新了哪份契约、是否新增 ADR。
- 大改动前先让 agent 写 spec，验收标准可执行，避免"看起来做完了"。
- agent 生成的文档必须跑 `check`；不要把 agent 的推测写成事实，未确认的标 `<待确认>`。
