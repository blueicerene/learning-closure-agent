# Learning Closure Agent

本地优先的一键学习收尾 Agent。  
A local-first AI workflow agent that helps learners close their study sessions.

当学习发生在 ChatGPT、NotebookLM、PDF、网页、播客文本和 Obsidian 之间时，学习上下文很容易散掉。Learning Closure Agent v0.1 的目标很小：在一次学习结束时，捕获当前内容，生成学习总结、关键知识点、未解决问题、下一步行动，并保存为本地 Markdown。

When learning is scattered across ChatGPT, NotebookLM, PDFs, web pages, podcast transcripts, and Obsidian, context is easy to lose. Learning Closure Agent v0.1 captures the current learning session, generates a closure, and saves it locally as Markdown.

## 项目解决的问题 / Problem

- 学习内容分散在多个工具里。
- 学习结束后不想手动复制、总结、分类、命名和打标签。
- 下一次学习时容易忘记上一次停在哪里。
- 需要一个轻量的 next action，让下一次学习能接上。

In short: it helps turn the end of a study session into a saved note and a concrete next step.

## 它不是什么 / What It Is Not

本项目不是 NotebookLM、ChatGPT 或 Obsidian 的竞品。  
It is not a competitor to NotebookLM, ChatGPT, or Obsidian.

它是一个 workflow layer：连接已有学习工具，而不是替代它们。

It is a workflow layer on top of existing tools.

It is also not:

- a cloud sync product
- a login-based SaaS
- a Notion / Anki / Readwise integration
- a background web monitor
- a full exam progress system
- a knowledge graph product

## v0.1 功能范围 / v0.1 Scope

Chrome Extension:

- Capture Current Page
- Capture Selected Text
- Manual Paste Text
- Primary Goal Track / Subject selection
- Learning Closure preview
- Classification preview and correction
- Continue from last session display

Local Server:

- Mock closure mode
- Real LLM closure mode
- Markdown export
- YAML frontmatter
- `learning-log.json`
- `classification-corrections.json`
- Minimal learning standard support for `LLM / Canadian Constitutional Law`

## v0.1 不支持什么 / Not Supported

- cloud sync
- user accounts
- payment
- automatic background monitoring
- full ChatGPT / NotebookLM history import
- automatic folder routing
- note merging
- full progress tracking
- mastery scoring
- quiz bank
- Notion API
- Anki API
- Readwise API

## 本地运行方法 / Local Setup

Install dependencies:

```bash
npm install
```

Create local server config:

```bash
cp server/.env.example server/.env
```

Edit `server/.env`. Keep secrets only in this local file.

Start the local backend:

```bash
npm run dev:server
```

Build the Chrome extension:

```bash
npm --workspace extension run build
```

## Chrome 插件加载方法 / Load Chrome Extension

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select `extension/dist`.
5. Pin Learning Closure Agent.

## Mock Mode 使用方法 / Mock Mode

Mock mode is for local demo and flow testing. It does not call the OpenAI API.

In `server/.env`:

```env
USE_MOCK_LLM=true
OPENAI_API_KEY=
```

Then run:

```bash
npm run dev:server
```

Use the extension:

1. Choose `Primary Goal Track`.
2. Choose `Subject`.
3. Capture a page, selected text, or pasted text.
4. Click Generate Closure.
5. Click Save.

## 法律英语词汇选择题 / Legal Vocab Quiz

v0.1 includes a local web app for manually pasted legal English vocabulary.

Start the backend:

```bash
npm run dev:server
```

Start the vocab web app:

```bash
npm run dev:web
```

Open `http://127.0.0.1:5174`.

Paste one vocabulary item per line, for example:

```text
estoppel - A rule preventing a person from denying something previously represented.
fiduciary duty: A duty to act loyally for another person's interests.
1. injunction - A court order requiring a person to do or stop doing an act.
- consideration: Something of value exchanged to form a binding contract.
```

The quiz shows one English term and four English definitions. Wrong answers enter the local review queue, and correct streaks schedule the next review after 3 / 7 / 14 / 30 days.

Vocabulary data is saved locally in `output/legal-vocab.json` and must not be committed.

### NotebookLM selected word lookup

After loading the Chrome extension, NotebookLM pages support selected word lookup:

1. Start the local backend with `npm run dev:server`.
2. Open NotebookLM in Chrome.
3. Select an English legal word or short phrase.
4. Click the floating `Look up` button.

The extension sends only the selected word or short phrase to the local backend, shows English and Chinese definitions in a small page popup, and automatically saves the word into tomorrow's local vocab review queue.

### Desktop image word lookup / 大王拖拽入口

The project also includes a small macOS desktop drop target for screenshot-based lookup.

Start the backend and web app first:

```bash
npm run dev:server
npm run dev:web
```

Then start the desktop drop target:

```bash
npm run dev:dropper
```

The floating `大王` window stays above other windows, remembers its last position, and accepts dragged image files. A typical flow is:

1. Take a screenshot of one English legal word or short phrase.
2. Drag the image onto the `大王` window or its `Drop` banner.
3. The app opens the local vocab web page.
4. OCR reads the word from the image.
5. The dictionary lookup runs and the word is added to review.

Current stable behavior:

- `大王` stands and wags his tail.
- The window can be moved manually.
- The window is kept visible when clicking the desktop.
- The visible card and `Drop` banner are intentional because fully transparent macOS windows do not reliably receive image drag events.

The desktop dropper is local-only. It posts the dragged image to the local backend, receives a temporary handoff key, then opens the local web app with that key.

## 真实 LLM Mode / Real LLM Mode

Real LLM mode calls the configured LLM API from the local server only. The extension never receives the API key.

In `server/.env`:

```env
USE_MOCK_LLM=false
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4.1-mini
```

Run the Section 91 fixture:

```bash
npm --workspace server run test:section91
```

Optional debug:

```env
DEBUG_LLM=true
```

Debug mode may print raw LLM responses and parsed closures. It must not print API keys.

## API Key 配置说明 / API Key

- Put the API key only in `server/.env`.
- Do not put API keys in frontend code.
- Do not commit `.env` or `server/.env` to GitHub.
- Use `server/.env.example` as a placeholder template only.

## 合规与许可材料说明 / Compliance Notice

This project must not be used to process licensed or restricted exam materials unless the user has confirmed that the material is permitted to be processed by the chosen tools.

特别是，对于 LSO licensing materials 或类似受许可限制的考试材料，不得将材料正文输入、上传、粘贴、截图、总结、翻译、释义或以其他方式传输到生成式 AI 工具，包括 real LLM mode。

Allowed use is limited to content the user has the right to process, such as original notes, public legal sources, public webpages, self-written reflections, and non-restricted learning metadata.

The user is responsible for checking the terms, licenses, and exam-body rules that apply to any source material.

## 隐私与安全 / Privacy & Security

- Captures only after the user clicks a button.
- Does not read cookies.
- Does not read browser history.
- Does not read localStorage or sessionStorage.
- Does not run background webpage monitoring.
- Saves learning data locally by default.
- Sends captured content only to the local backend and, in real LLM mode, the configured LLM API.
- API key is stored only in `server/.env`.
- `.env`, `server/.env`, `output/`, `node_modules/`, and `dist/` must not be committed.

See [docs/SECURITY.md](/Users/rene/Documents/学习助手/docs/SECURITY.md).

## Markdown Output

Saved notes include YAML frontmatter with classification and learning standard metadata:

```yaml
primary_goal_track: "LLM"
subject: "Canadian Constitutional Law"
topic: "Division of Powers"
knowledge_types:
  - "statute"
  - "concept"
learning_standard_used: true
status: "inbox"
```

## Roadmap

v0.2 已完成：Learning Standard & Progress Backbone。

- multi-source Learning Standard structure
- progress tracked by `standardId`
- `learning-progress.json`
- Chinese `Learning Progress Summary.md`
- `GET /api/progress`
- Section 91 / Section 92 real closure validation

v0.3 暂停：不继续扩展 Review Queue / Today Plan / Bar or NCA planner。

原因：考试机构和学习材料许可可能限制将授权材料输入、上传或传输到生成式 AI 工具。继续扩展学习计划、复习队列或考试材料处理功能前，必须先完成来源许可和合规边界设计。

当前项目作为 v0.2 稳定原型收口：local-first capture, closure, Markdown export, and learning progress backbone for permitted content only.
