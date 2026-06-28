# Learning Standard Design v0.2

## 1. Learning Standard 的定义

Learning Standard 是某个学习目标下，一个 subject 应该覆盖的学习标准。它不负责分类，不替代 taxonomy。

Taxonomy 回答：

- 这条学习内容属于哪个 `primary_goal_track`
- 属于哪个 `subject`
- 当前 topic / subtopics 是什么

Learning Standard 回答：

- 这个 subject 应该覆盖哪些核心主题
- 当前学习内容命中了哪些标准主题
- 哪些主题可能适合作为下一步学习行动
- 未来如何把一条学习记录映射到一个或多个学习标准

## 2. 标准来源类型

v0.2 的数据结构预留三类未来来源：

- `official_search`
- `user_uploaded`
- `user_custom`

当前内置标准使用 `built_in`，表示这是项目内置的初始标准，不代表官方完整大纲。

## 3. official_search / user_uploaded / user_custom 的区别

`official_search`：

Agent 未来可以从官方来源检索学习标准，例如 NCA、LSO、考试机构官网。该来源应记录 `sourceUrl`、`retrievedAt`、`authorityLevel`，并需要用户确认。

`user_uploaded`：

用户未来可以上传课程大纲、考试大纲、reading list、PDF、Word 或文本。该来源应记录 `sourceFile`、`uploadedAt`，并保留用户确认状态。

`user_custom`：

用户自己补充的学习要求、个人目标、课程重点或导师要求。该来源不一定来自官方，但对个人 workflow 可能非常重要。

## 4. 为什么当前只预留结构，不做搜索

v0.2 第一阶段目标是让 Learning Standard 的数据结构稳定下来，不实现联网搜索、文件上传、PDF 解析或 OCR。

原因：

- v0.1 的核心流程需要继续稳定：Capture → Closure → Markdown → Learning Log → Last Action
- 官方来源搜索需要独立的可信来源策略
- 用户上传涉及文件处理、隐私、安全和解析质量
- 过早加入 UI 和搜索会扩大权限和复杂度

因此，本阶段只保存结构和读取能力。

## 5. 一条学习记录如何映射多个标准

同一条 Markdown 学习记录只保存一份，但可以映射到多个 learning standards。

示例：

```ts
primaryStandardId: "LLM_CANADIAN_CONSTITUTIONAL_LAW"
relatedStandardIds: ["NCA_CANADIAN_CONSTITUTIONAL_LAW"]

standardMappings: [
  {
    standardId: "LLM_CANADIAN_CONSTITUTIONAL_LAW",
    matchedTopics: ["Division of Powers", "Section 91"],
    mappingReason: "本次学习主要服务于 LLM 宪法课程。"
  },
  {
    standardId: "NCA_CANADIAN_CONSTITUTIONAL_LAW",
    matchedTopics: ["Distribution of Legislative Powers", "Sections 91-95"],
    mappingReason: "该内容也符合 NCA Canadian Constitutional Law 大纲。"
  }
]
```

当前 v0.2 第一阶段不写入 `learning-progress.json`，只在设计上明确该模型。

## 6. 为什么进度要按 standardId 计算

进度不能只按 subject 计算，因为同一个 subject 可能服务于不同目标。

例如 Canadian Constitutional Law 可能同时服务于：

- `LLM / Canadian Constitutional Law`
- `Certificate / NCA / Canadian Constitutional Law`

两者的主题重叠，但学习标准、重点、顺序和验收方式可能不同。

因此未来的 `learning-progress.json` 应以 `standardId` 为主键，而不是只用 subject。

## 7. v0.2 当前范围

本阶段只做：

- 更新 `config/learning-standards.json` 为多来源结构
- 保留 built-in 初始标准
- 让现有 Learning Closure prompt 继续能读取标准主题和 next action rules
- 新增本设计文档

本阶段不做：

- 联网搜索
- 官方来源爬取
- PDF / Word 上传
- OCR
- 标准管理 UI
- 完整进度 dashboard
- 掌握度评分
- 考试通过率

## 8. v0.3 以后再考虑的方向

v0.3 或更晚再考虑：

- 用户上传 syllabus / reading list
- 官方来源搜索
- 标准来源可信度标注
- 用户确认标准差异
- `learning-progress.json`
- 多 standard mapping 的 UI
- 基于 standardId 的轻量学习进度
