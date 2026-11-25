# AGENTS.md

<!--
  Agent 的唯一入口。保持 < 200 行，只写"每次都必须知道"的内容。
  细节放 docs/，这里只放路由和硬约束。
-->

## 项目是什么

{{PROJECT_NAME}}：<一句话说清为谁解决什么问题>。

## 每次会话先读

1. `{{DOCS_DIR}}/index.md` — 文档地图，找东西从这里开始
2. `{{DOCS_DIR}}/product/glossary.md` — 术语，先对齐词义
3. `{{DOCS_DIR}}/architecture/overview.md` — 系统全景与模块边界

## 硬约束

- 改公共接口 → 同步更新 `{{DOCS_DIR}}/architecture/modules/<模块>.md`
- 引入依赖 / 换存储 / 改鉴权 / 改数据模型 → 先写 ADR，再动手
- 已 Accepted 的 ADR 不编辑，只新增 superseding ADR
- 只信 `status: active` 的文档；`archive/` 仅用于追溯，不得据此实现功能
- 引用已发布行为时用 tag 永久链接，不要用 `blob/main`
- 不认识的术语先查 glossary，仍不确定就停下来问

## 命令

- 安装：`{{INSTALL_CMD}}`
- 测试：`{{TEST_CMD}}`
- 单文件测试：`<填写>`
- Lint：`<填写>`
- 文档检查：`node scripts/docs-tool.mjs check`

## 找东西的顺序

`{{DOCS_DIR}}/index.md` → 模块契约 → grep 代码 → 问人。**不要猜。**

## 完成定义（DoD）

代码 + 测试 + 文档三件套：

- 行为有变 → spec / ADR / 模块契约至少更新一处
- 新增文档 → 登记到 `{{DOCS_DIR}}/index.md`
- 新增术语 → 补进 `glossary.md`
- 提交前跑 `node scripts/docs-tool.mjs check` 并通过

## 文档系统的规则

完整规则见 `{{DOCS_DIR}}/_meta/CONVENTIONS.md`。三条最短版本：

1. 一个事实只写一处，其余地方链接过去。
2. 活文档原地更新；承诺、合规、对外契约才版本化。
3. 过期由脚本发现，不靠记忆；归档文档只读。
