# v0.2：Learning Standard & Progress Backbone

v0.2 的定位是 **Learning Standard & Progress Backbone**，也就是“学习标准与进度骨架”。

它不是完整学习计划系统，也不是 Review Queue、Today Plan 或督学功能的最终形态。v0.2 的目标是先把后续功能依赖的底层关系跑通：学习标准从哪里来、学习内容如何映射到 learning standard、学习进度如何按 standardId 计算，以及最小的 covered topics / missing topics / unresolved questions / pending next actions 如何形成学习规划骨架。

## v0.2 已完成能力

- 建立多来源 Learning Standard 结构。
- 在 `standardSources` 中预留 `built_in` / `official_search` / `user_uploaded` / `user_custom` 来源类型。
- 明确一条学习记录未来可以映射到多个 learning standards。
- progress 按 `standardId` 记录，而不是直接按 subject 记录。
- 新增并维护 `learning-progress.json`。
- 新增并维护 `Learning Progress Summary.md`。
- 新增 `GET /api/progress`，用于读取当前本地学习进度。
- 记录 `coveredTopics`，表示已经接触过的主题。
- 计算 `missingTopics`，表示 learning standard 中尚未覆盖的主题。
- 汇总 `unresolvedQuestions`，保留学习中尚未解决的问题。
- 汇总 `pendingNextActions`，保留下一步可执行行动。
- 记录 `sourceFiles`，把进度项关联到已保存的 Markdown 文件。
- 生成中文学习进度摘要，让工程数据变成用户可读的学习进度说明。
- 修复默认 progress 路径，确保默认写入项目根目录 `output/learning-progress.json`。
- 对 `unresolvedQuestions`、`pendingNextActions`、`sourceFiles` 做去重。
- 完成 Section 91 / Section 92 真实闭环验证。
- 修复 Section 92 closure focus，避免 Section 92 输入被 Section 91 示例或学习标准引导带偏。

## v0.2 不做什么

v0.2 明确不做：

- 不做完整学习计划。
- 不做 Today Plan。
- 不做 Review Queue。
- 不做 Dashboard。
- 不做复习提醒。
- 不做 syllabus 上传 UI。
- 不做官方来源搜索实现。
- 不做 Notion / Anki / Readwise。
- 不扩大 Chrome extension 权限。

## v0.2 的产品边界

v0.2 只做到最小学习规划骨架：

- 已接触主题。
- 待覆盖主题。
- 未解决问题。
- 待执行行动。
- 建议下一步。

这些信息可以帮助用户看到“已经碰过什么、还缺什么、下一步从哪里接上”。但它还不是完整的学习计划，也不包含提醒、排期、复习节奏、掌握度评分或考试进度系统。

完整学习计划能力放到 v0.3 之后再设计。

## v0.3 方向

v0.3 可以考虑在 v0.2 的数据骨架上继续发展：

- Review Queue。
- Today Plan。
- pending actions 状态管理。
- 标准管理页面。
- 用户上传 syllabus。
- 官方来源搜索。
- 学习计划和复习节奏。

这些能力应继续遵守本项目的本地优先原则，并保持 Chrome extension 权限克制。
