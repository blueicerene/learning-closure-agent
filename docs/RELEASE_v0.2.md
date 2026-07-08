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

由于考试机构和学习材料许可可能限制将授权材料输入、上传或传输到生成式 AI 工具，完整学习计划能力不再作为 v0.3 继续推进。

## v0.2 最终收口说明

v0.2 作为稳定原型收口：它证明了 local-first capture、closure、Markdown export、learning standard 和 progress backbone 的技术可行性。

但本项目不应被扩展为面向受许可考试材料的自动学习计划系统。对于 LSO licensing materials 或类似受限制材料，不应使用本项目进行 capture、LLM 总结、翻译、释义、复习规划或材料处理。

## v0.3 暂停

v0.3 暂停，不继续实现：

- Review Queue。
- Today Plan。
- Bar / NCA planner。
- pending actions 状态管理。
- 标准管理页面。
- 用户上传 syllabus。
- 官方来源搜索。
- 学习计划和复习节奏。

如果未来重新启动，前置条件不是继续写功能，而是先完成合规边界设计：哪些来源可以处理、哪些内容只能本地记录元数据、哪些材料完全不能进入 AI 工具。
