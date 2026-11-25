# docs-system

> An agent skill that scaffolds a **self-maintaining** documentation system for large projects.
> 给大型项目初始化「能自我维护」的文档体系的 agent skill。

文档的问题从来不是"写得不够多"，而是：代码改了文档没改、过期了没人发现、废弃了还挂在索引里。这个 skill 把这三件事变成**机制**，而不是靠自觉。

## 它解决什么

| 问题 | 机制 |
|---|---|
| 代码改了，文档没跟上 | `docs.map.yaml` 声明代码→文档映射，PR 里未同步就失败 |
| 文档悄悄过期 | `last_reviewed + review_interval_days`，每周自动生成复核队列 issue |
| 新文档没人找得到 | 必须登记 `docs/index.md`，否则 CI 失败 |
| 链接指向已删除文件 | 死链 + `source_of_truth` 路径失效检查 |
| 归档文档被偷偷改 | `status: archived` 的文件只读，改动即拦截 |
| 不知道哪份能信 | 四态状态机：`active / stale / deprecated / archived` |
| 决策理由丢失 | ADR 不可变，只能被新 ADR 取代 |

## 安装

需要 **Node ≥ 18** 和 **git**，无 npm 依赖。

```bash
# DeepSeek Harness / 通用 agents 目录
git clone https://github.com/yuren-dev/docs-system.git ~/.agents/skills/docs-system

# Claude Code
git clone https://github.com/yuren-dev/docs-system.git ~/.claude/skills/docs-system
```

也可以只把 `SKILL.md` 所在目录复制到你的 skills 根目录。

## 使用

在项目里对 agent 说：

> 用 docs-system 初始化文档体系

agent 会按 `SKILL.md` 的六步走：勘察仓库 → 问清 4 个参数 → 生成骨架 → 建立代码/文档映射 → 接 CI → 真跑验证。

也可以手动执行：

```bash
# 生成骨架（--dry-run 先看清单）
node ~/.agents/skills/docs-system/scripts/docs-tool.mjs init \
  --root . --name "my-project" --owner "@org/team" \
  --test "pnpm test" --install "pnpm i"

# 日常校验
node scripts/docs-tool.mjs check
node scripts/docs-tool.mjs drift --base origin/main
node scripts/docs-tool.mjs audit --strict
node scripts/docs-tool.mjs audit --write docs/_meta/audit.md
```

| 命令 | 作用 | 何时跑 |
|---|---|---|
| `init` | 生成 AGENTS.md、docs 骨架、CI、CODEOWNERS | 一次性 |
| `check` | front-matter、索引覆盖、死链、代码路径失效 | 每次 PR |
| `drift` | 改了代码没改对应文档 / 归档被修改 | 每次 PR |
| `audit` | 复核周期到期的文档清单 | 每周 |

退出码：`0` 通过，`1` 有问题，`2` 用法或内部错误。

## 生成的骨架

```
AGENTS.md                     # agent 唯一入口，<200 行
docs.map.yaml                 # 代码 → 文档 映射
docs/
├── index.md                  # 唯一导航源
├── product/{glossary,vision}.md
├── architecture/{overview,modules,adr}/
├── specs/                    # 变更级规格
├── runbooks/                 # 部署、回滚、故障处理
├── archive/                  # 归档 + 索引
├── _meta/CONVENTIONS.md      # 仓库级文档规范
└── _templates/               # 契约 / ADR / Spec / Task Brief 模板
.github/{workflows/docs.yml,PULL_REQUEST_TEMPLATE.md,CODEOWNERS}
scripts/docs-tool.mjs
```

## 四条设计原则

1. **按腐化速度分层**：runbook 30–90 天复核，契约 90–180 天，愿景/术语 180 天+，ADR 永不改只被取代。
2. **一个事实一处写**：重复是过期之母，其余地方只放链接。
3. **history 分三种**：编辑历史交给 git，语义历史交给文件内变更记录，承诺快照才版本化。
4. **删除优于堆积**：归档有保留期，到期清理；索引信噪比比文档数量重要。

完整推理见 [`references/design.md`](references/design.md)，运维节奏见 [`references/operations.md`](references/operations.md)。

## 自测

```bash
bash test/selftest.sh
```

会在临时目录里造一个仓库，跑通 init / check / audit / 索引覆盖 / 漂移拦截 / 跳过标签全流程。

## 仓库结构

```
SKILL.md                 # agent 加载的指令
references/              # 设计原理、运维手册（按需加载）
scripts/docs-tool.mjs    # 零依赖工具
templates/               # 生成到目标仓库的模板
test/selftest.sh         # 端到端自测
```

## 兼容性

- Node ≥ 18，纯 ESM，零依赖
- 任意语言的项目（脚本只读写 Markdown / YAML 子集）
- GitHub Actions 开箱即用；GitLab CI 片段见 `references/operations.md`
- Windows 下命令用 `node` 直接跑；`test/selftest.sh` 需要 bash

## 许可

仓库暂未附带开源许可证（保留所有权利）。如需在团队或产品中复用，请先联系作者。
