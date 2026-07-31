# 产品交付门禁

每日计划重构的合同位于 `config/delivery/daily-plan-v1.json`。
答题结果语境与例句修复的合同位于 `config/delivery/quiz-feedback-v1.json`。
题目质量与重点复习的合同位于 `config/delivery/question-quality-focus-v1.json`。
项目级决策台账位于 `config/delivery/master-decision-ledger.json`。

先运行决策覆盖审计：

```bash
/opt/homebrew/bin/npm run audit:decisions
```

该命令只证明已确认事项有明确路由、负责人和验收条件，并且当前迭代与
全部当前发布合同逐项对应。它不代表功能已经实现。

交付前必须运行：

```bash
/opt/homebrew/bin/npm run release:gate
```

只有同时满足以下条件时，命令才允许返回成功：

1. 合同中的全部核心决策标记为已实现。
2. 每条决策的独立验证命令实际通过。
3. 所有必需的 JSON 或截图证据文件真实存在，并在合同 `evidence` 中登记。
4. 三条真实用户路径全部标记为通过。
5. 合同整体状态改为 `ready`。

不得先填写通过状态再补测试，也不得用计划文档、构建成功或人工口头确认代替真实路径证据。

`release:gate` 会依次执行每日计划、题目质量与重点复习、答题反馈三个合同的
验证命令。任意合同未通过时，整个稳定版本都不得发布。

当前审计快照见 `config/delivery/MASTER_DECISION_AUDIT.md`。
