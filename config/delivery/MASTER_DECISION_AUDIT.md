# Master Decision Audit

审计日期：2026-07-26

## 结论

- 决策总数：22
- 当前迭代：8
- 后续里程碑：10
- 等待用户验收：2
- 已验证：2
- `daily-plan-v1` 合同覆盖：8/8，无缺项
- daily plan 交付门禁：未通过，仍有 6 项要求未满足，全部集中在完成日历
- 真实运行核对：2026-07-26 计划已安全迁移为 20 题并保留已完成 4 题；首页显示 4/20，测试接口仅返回冻结计划剩余 16 题，桌宠提示同步为“待复习 16”
- `DAILY_PLAN_V2_ENABLED=true` 已在 3333 后端生效；验证读取前后词库文件哈希一致，未提交真实答案
- 中途恢复：隔离副本完成前 2 题后重新读取，冻结顺序未改变，并从第 3 道未完成题继续

## 当前迭代

当前迭代只包含 `daily-plan-v1` 合同中的八项：

1. 每日冻结计划最多 20 题。
2. 每日新词最多 10 题，到期复习优先。
3. 已学到期复习与待进入计划词分池。
4. 计划开始后冻结，后续查词不扩张当天计划。
5. 测试只消费冻结计划，中途返回继续下一道未完成题。
6. 将现有 142 题计划安全迁移为不超过 20 题，并保留已完成 4 题。
7. 首页、学习状态与测试页共享同一组计划计数。
8. 最近 7 天与整月日历使用实心、线条、留白三档大王标记。

## 需用户确认

- `PET-02`：当前统一大王动画是否达到最终可接受的还原度与连续性。现有记录没有明确的最终验收结论。
- `REM-02`：授权后，iCloud 提醒是否已在用户 iPhone 实际同步且没有重复事项。该跨设备路径无法由自动测试替代。

## 命令结果

```text
$ npm run audit:decisions
PASS: master decision ledger is routed and daily-plan contract coverage is complete
daily_plan_contract_coverage: 8/8
```

```text
$ npm run release:gate:daily-plan
BLOCKED: 6 release-gate requirement(s) are unmet
```

当前剩余门禁集中在完成日历。覆盖审计通过只说明决策没有失联；只有 release gate 返回成功，才允许把 daily plan 重构整体视为完成。
