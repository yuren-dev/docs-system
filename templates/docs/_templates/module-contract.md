---
id: _templates/module-contract
title: 模块契约模板
owner: "{{OWNER}}"
status: draft
tier: 4
index: false
---

# <模块名>

<!-- 复制到 docs/architecture/modules/<module>.md，改 id 与 title，status 改 active。 -->

## 职责（一句话）

<它存在的唯一理由。写不出来说明模块边界不清。>

## 公共接口

| 名称 | 输入 | 输出 | 失败语义 |
|---|---|---|---|
| `<fn/signature>` | <...> | <...> | <错误类型与触发条件> |

## 不变量

- <任何调用顺序下都必须成立的事实>

## 边界

- 允许依赖：<模块>
- 禁止依赖：<模块>（原因：<避免环/层次>）

## 用法示例

```<lang>
<最小可运行示例>
```

## 非目标

- <明确不做的事>

## 变更记录

| 日期 | 变更 | 关联 |
|---|---|---|
| {{DATE}} | 初始化 | — |
