# 项目复盘：Learning Closure Agent

## 项目起点

Learning Closure Agent 的起点是一个本地优先的学习工作流想法：当学习发生在 ChatGPT、NotebookLM、PDF、网页和 Obsidian 之间时，用户很容易在一次学习结束后失去上下文。本项目尝试把一次学习会话收口为 Markdown 笔记、知识卡片、未解决问题和下一步行动。

## v0.1 做了什么

v0.1 完成了最小可运行闭环：

- Chrome Extension 捕获当前页面、选中文本或手动粘贴内容。
- Local Express server 负责生成 closure。
- 支持 mock mode 和 real LLM mode。
- 输出 summary、key takeaways、knowledge cards、unresolved questions 和 next actions。
- 保存 Markdown 和 YAML frontmatter。
- 保存 learning log 和 last action。
- 建立 taxonomy 与 classification 基础设施。
- 增加用户分类纠错记录。

v0.1 的核心价值是证明 Capture -> Closure -> Markdown -> Learning Log -> Last Action 的本地学习收尾流程可行。

## v0.2 做了什么

v0.2 的定位是 Learning Standard & Progress Backbone，也就是学习标准与进度骨架。

它完成了：

- 多来源 Learning Standard 数据结构。
- `built_in` / `official_search` / `user_uploaded` / `user_custom` 来源预留。
- 按 `standardId` 记录 progress。
- `learning-progress.json`。
- `Learning Progress Summary.md`。
- `GET /api/progress`。
- covered topics、missing topics、unresolved questions、pending next actions 和 source files。
- 中文学习进度摘要。
- 默认 progress 路径修复。
- progress 数组去重。
- Section 91 / Section 92 真实闭环验证。
- Section 92 closure focus 修复。

v0.2 的核心价值是证明学习记录可以映射到 learning standard，并形成最小学习规划骨架。

## 为什么停止 v0.3

原本的 v0.3 方向包括 Review Queue、Today Plan、Bar / NCA planner、syllabus 上传、官方来源搜索和更完整的学习计划功能。

在产品探索中发现，考试机构和学习材料许可可能限制用户将授权学习材料输入、上传、粘贴或传输到生成式 AI 工具。对于 LSO licensing materials 或类似受限制材料，使用 AI 工具进行总结、翻译、释义、学习辅助或复习规划都可能违反相关规则。

这意味着如果继续做 v0.3，项目会从“学习工作流工具”变成“考试材料处理和学习计划系统”，需要先解决来源许可、合规边界、引用、版本管理和禁止内容识别等问题。这个成本和风险已经超过当前原型阶段的合理范围。

因此，v0.3 暂停，不继续扩展。

## 合规边界

本项目不应用于处理用户无权处理或受许可限制的考试材料正文。

可以考虑的使用范围：

- 用户原创学习笔记。
- 用户自写反思。
- 公开法规。
- 公开案例。
- 公开网页。
- 非受限学习元数据。

不应使用的范围：

- LSO licensing materials。
- 其他明确禁止输入 AI 工具的考试材料。
- 受版权或许可限制且未确认允许 AI 处理的课程资料。
- 任何用户无权复制、上传、总结、翻译或传输到第三方服务的内容。

## 学到什么

这个项目证明了一个重要结论：AI 学习工具的关键问题不只是能不能生成有用笔记，而是能不能合法、稳妥地处理学习材料。

技术上，v0.1 / v0.2 已经跑通了本地 capture、closure、Markdown、classification、learning standard 和 progress backbone。

产品上，项目需要在进入学习计划和考试准备系统之前，先解决内容许可和来源边界。发现这一点后暂停 v0.3，是一次理性的产品收口，而不是失败。

## 当前结论

Learning Closure Agent 保留为 v0.2 稳定原型：

- 可用于用户有权处理的内容。
- 可作为 local-first learning workflow prototype。
- 不继续扩展为 Bar / NCA 自动学习计划系统。
- 不用于处理受许可限制的考试材料。
