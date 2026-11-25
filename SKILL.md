---
name: docs-system
description: 初始化并长期维护大型项目的文档体系：生成 AGENTS.md 与 docs 目录、模块契约/ADR/Spec 模板、docs.map 漂移检查、过期巡检与归档规则，并接入 CI 让文档随代码更新、自动暴露过期项。当用户要搭建或重构文档体系、写 AGENTS.md、治理文档更新/过期/归档、给文档加 CI 时使用。
whenToUse: 用户说"建立文档体系/文档系统"、"初始化 docs"、"写 AGENTS.md 或 CLAUDE.md 约定"、"文档老是过期"、"文档怎么维护"、"把文档接入 CI"、"归档旧文档"时。
---

# 文档系统：初始化 + 自我维护

目标不是产出更多文档，而是让文档**随代码一起变、过期能被发现、废弃有明确归宿**。默认面向仓库内的 Markdown，不依赖任何 npm 包，不绑定文档站。

## 心法（先内化，再动手）

1. **一个事实一处写**。重复是过期之母；其余地方只放链接。
2. **按腐化速度分层**：runbook(T1) 30–90 天复核，契约(T2) 90–180 天，愿景/术语(T3) 180 天+，ADR(T4) 永不改只被取代。
3. **更新靠事件，不靠自觉**：代码改动 → 文档必须同改，用 `docs.map.yaml` + CI 强制。
4. **过期靠脚本，不靠记忆**：`last_reviewed + review_interval_days`，每周生成复核队列。
5. **归档靠状态，不靠目录直觉**：`status: archived` + 只读 + 索引，删除优于堆积。

## 工作流

### Step 0 勘察（不要跳过）

在目标仓库根目录执行并阅读结果：

```bash
pwd && ls -a && git remote -v 2>/dev/null | head -3
cat package.json go.mod pyproject.toml Cargo.toml 2>/dev/null | head -60
ls .github/workflows .gitlab-ci.yml 2>/dev/null
find . -maxdepth 2 -iname "*.md" -not -path "*/node_modules/*" | head -30
```

要搞清：语言/包管理器、测试命令、是否 monorepo、CI 平台、已有文档（`README`、`docs/`、`wiki/`、`CONTRIBUTING`）、顶层源码目录、谁可能当 owner（CODEOWNERS/git log 常见作者）。

### Step 1 一次问清（最多 4 个问题）

只有勘察无法推断时才问，**用一次 `ask_user_question` 批量问完**，不要逐条追问。典型问题：

- 文档根目录用 `docs/` 还是 `doc/`？文档用中文还是英文？
- 本项目的 T1 文档有哪些？（部署、回滚、on-call、安全、数据修复）
- `docs/` 的 owner 写什么？（团队 handle，如 `@org/team`）
- CI 平台：GitHub Actions / GitLab / 暂无？

能从仓库推断的就别问；用户没回答的项用合理默认值并在汇报里标注。

### Step 2 生成骨架

用本 skill 的脚本生成，不要手抄模板（`<skill>` 指 SKILL.md 所在目录）：

```bash
node "<skill>/scripts/docs-tool.mjs" init --root . \
  --name "<项目名>" --owner "@org/team" \
  --test "pnpm test" --install "pnpm i"
```

先加 `--dry-run` 看清单。已有 `AGENTS.md` 时脚本不会覆盖，而是写 `docs/_meta/AGENTS.snippet.md`，**此时必须手工合并**，不要把原文件替换掉。

生成后立刻补三处真实内容（其余模板可留着待填）：

- `AGENTS.md`：项目一句话、安装/测试/lint 命令、DoD。
- `docs/architecture/overview.md`：模块地图与数据流（从源码目录和入口文件推断）。
- `docs/product/glossary.md`：至少 5 个真实领域术语（从类型名、数据库表、UI 文案提取）。

**不要编造**：无法从代码确认的事实写 `<待确认：...>`，并在汇报里列出。

### Step 3 建立代码↔文档耦合（最关键的一步）

读源码目录，挑 5–10 条"改了代码就必须改文档"的映射写进根目录 `docs.map.yaml`：

```yaml
- docs: ["docs/architecture/modules/billing-invoice.md"]
  sources: ["src/billing/invoice/**"]

- docs: ["docs/runbooks/deploy.md"]
  sources: ["deploy/**", "Dockerfile", ".github/workflows/release.yml"]
```

选择标准：T1 文档优先；有公共接口的模块优先；最近 6 个月改动频繁的目录优先。映射宁少勿滥——每条都应是"不同步就是 bug"的关系。

### Step 4 接 CI 与归属

- `.github/workflows/docs.yml` 已由 init 生成（PR 检查 + 每周巡检）。若项目用 GitLab，按 `references/operations.md` 的片段改写。
- `.github/CODEOWNERS` 已生成；若已存在，**追加** docs 规则而不是覆盖。
- 提醒用户开启分支保护：`docs` workflow 的 `check` job 设为 required。

### Step 5 验证（必须真跑）

```bash
node scripts/docs-tool.mjs check
node scripts/docs-tool.mjs drift --base HEAD~1   # 无历史时跳过，说明原因
node scripts/docs-tool.mjs audit --strict
```

`check` 必须 0 error。`audit` 首次运行通常会有历史文档逾期——这是正常发现，把清单交给用户，不要为了让命令通过而改日期造假。

### Step 6 汇报

给一张表：生成了什么、哪些需要人补、CI 怎么生效、下一步做什么。列出所有 `<待确认>` 项。

## 质量门槛（写内容时逐条对照）

- **模块契约**必须回答：职责一句话、公共接口与失败语义、不变量、允许/禁止依赖、非目标。写不出"不变量"通常说明模块边界没想清。
- **Spec** 的验收标准必须可执行：`Given/When/Then` 或可勾选断言，至少覆盖一条失败路径、一条并发/边界。
- **ADR** 只写背景/决策/备选/后果；Accepted 后冻结。
- **AGENTS.md** < 200 行，只放"每次都必须知道"的路由和硬约束，细节链接到 docs。
- **Runbook** 命令可复制、有回滚、写明"什么情况下不要执行"。

## 自我维护闭环（缺一项都不算完成）

| 机制 | 落点 | 触发 |
|---|---|---|
| 索引覆盖 | `docs/index.md` + `check` | 每次 PR |
| 代码漂移 | `docs.map.yaml` + `drift` | 每次 PR |
| 结构/链接/路径校验 | `check` | 每次 PR |
| 过期巡检 | `audit` + 每周 workflow 建 issue | 每周 |
| 归档只读 | `drift` 检查 archived 文件 | 每次 PR |
| 复核协议 | `docs/_meta/CONVENTIONS.md` | 人工，按队列 |

## 不要做

- 不要把所有历史文档一次性重写——先建骨架和守门，再逐份迁移。
- 不要用 `-v2`、`-final` 命名活文档；活文档原地改。
- 不要给内部文档搞版本化文档站。
- 不要在 CI 里自动"修复"过期日期；复核必须有人真的验证。
- 不要为通过 `check` 而删掉真实文档或关掉规则。

## 参考资料（按需加载）

- `references/design.md` — 分层、状态机、三种历史、度量、反模式。用户问"为什么这样设计"时读。
- `references/operations.md` — 每周/每季度怎么运维、归档操作、老项目迁移、GitLab CI、排错。
