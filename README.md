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

After v0.1 is stable in real use:

- test with several real learning sessions
- refine capture heuristics only where needed
- improve learning standards one subject at a time
- consider export integrations later, only if the local-first workflow proves useful
