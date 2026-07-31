# 大王陪你背单词 · V2

本地优先的法律英语学习工作台：在网页、PDF 与截图中查词，生成中英双语法律释义，自动加入间隔复习，并由桌面宠物“大王”提示学习节奏。

A local-first legal English learning workspace for bilingual dictionary lookup from webpages, PDFs, and screenshots, automatic spaced review, and a learning-aware macOS companion named Da Wang.

项目同时保留最初的学习收尾能力：捕获一次学习会话，生成总结、关键知识、未解决问题与下一步行动，并保存为本地 Markdown。所有词库、复习状态和学习记录默认留在本机。

## V2 稳定基线

- 在线法律英语查词，返回中文释义、英文释义、音标、法律语境与例句。
- 网页、NotebookLM、ChatGPT 和本地 PDF 选词查询。
- 单词截图 OCR；拖入“大王”后自动识别、查询并进入词库。
- 冻结式每日计划：校准期每天最多 20 题，其中待进入计划词最多 10 个；积压词库不会成为当天债务。
- 四选一英文释义测试、结果页发音/语境/例句，以及简化间隔复习与重点强化。
- 最近 7 天与整月完成日历、20:00 每日提醒和本地词库质量治理。
- 透明、可拖动、可接收图片的 macOS 桌面宠物，随待复习、作答和拖图状态变化。
- 本地学习会话收尾、Markdown 输出与 Learning Standard 进度骨架。

V2 的发布内容、验收事实和已知限制见 [docs/RELEASE_V2.md](docs/RELEASE_V2.md)。

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

## 兼容保留：学习收尾能力

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

## 产品边界

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
6. For local PDF files opened from your computer, open the extension details and enable `Allow access to file URLs`.

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

## 法律英语词汇与每日复习

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

The quiz shows one English term and four English definitions. Wrong answers enter reinforcement, while successful independent reviews advance the spaced-review state.

The dashboard and all entry points share one frozen daily-plan calculation:

- at most 20 planned questions during the calibration period
- at most 10 pending-pool terms released into a day
- due review before new terms
- one stable plan that resumes from the next unanswered question

Open `http://127.0.0.1:5174/?view=quiz` to go directly to today's review. The same status is available from `GET /api/vocab/learning-status`.

Vocabulary data is saved locally in `output/legal-vocab.json` and must not be committed.

### Webpage and PDF selected word lookup

After loading the Chrome extension, supported study pages can look up selected legal English words:

1. Start the local backend with `npm run dev:server`.
2. Open NotebookLM, ChatGPT, eClass, CanLII, a supported legal website, or a PDF in Chrome.
3. Select an English legal word or short phrase.
4. On a supported webpage, click the floating `查词` button. In Chrome's built-in PDF viewer, right-click the selection and choose the single `查词` action.

The extension sends only the selected word or short phrase to the local backend, shows English and Chinese definitions in a small page popup, and automatically saves the word into tomorrow's local vocab review queue.

The selection context menu contains only `查词`; it does not include review routing or confirmation steps. Today's review remains available from the web home page, the extension popup, and the Da Wang desktop companion.

Local PDFs use Chrome's file URL permission. Enable `Allow access to file URLs` for the unpacked extension. Chrome's built-in PDF viewer does not allow the extension to inject the webpage selection bubble, so PDF lookup uses the single right-click `查词` action instead.

### Codex Pet / 大王拖拽识词入口

The project also includes a small macOS Codex Pet for screenshot-based lookup. It uses the existing local OCR and legal dictionary workflow, so the pet is the entry point rather than a separate dictionary.

Start the backend and web app first:

```bash
npm run dev:server
npm run dev:web
```

Then start the desktop drop target:

```bash
npm run dev:dropper
```

For daily use on macOS, build the double-click desktop app:

```bash
scripts/build-da-wang-app.sh
```

This creates `/Users/rene/Desktop/大王查词.app` with a Da Wang icon. Double-clicking the app starts the backend, starts the vocab web app if needed, and opens the floating `Codex Pet · 大王`.

The desktop launcher uses a precompiled local `Codex Pet · 大王.app`. It rebuilds when the Pet source or packaged animation assets change, which keeps normal startup fast, reuses one Pet instance, and avoids depending on Swift compilation at every launch. The launcher waits for both the backend and web app health checks before showing the drop target.

The floating `大王` window stays above other windows, remembers its last position, and accepts dragged image files. A typical flow is:

1. Take a screenshot of one English legal word or short phrase.
2. Drag the image anywhere inside the invisible rectangular area occupied by `大王`.
3. The app opens the local vocab web page.
4. OCR reads the word from the image.
5. The dictionary lookup runs automatically and the word is added to review.

Current stable behavior:

- The same validated v2 `大王` Pet is used by Codex and the desktop drop target.
- Every visible state uses the same confirmed high-fidelity Da Wang identity, fixed canvas, bottom anchor, transparent edge treatment, face, eyes, tabby markings, tuxedo, and lighting. The silhouettes are intentionally distinct: idle stands with a ball, due raises a paw, working looks down, success celebrates, failure lowers his head and ears, and focus sits with a wagging tail.
- The pet reacts to hover, image drag, lookup progress, success, and failure.
- The pet also reflects the review rhythm: due-word reminders, encouragement after a correct answer, and a high-fidelity seated tail-wag loop for focused review after repeated wrong answers.
- Later image drops reuse the existing local vocab tab instead of opening a new tab each time.
- The native macOS window and its content are visually transparent, so only `大王` is visible.
- A compact rounded Chinese bubble shows the current state without restoring the old rectangular card: idle asks `有不会的单词吗？`, focused review shows the live due count, and image handoff shows `放心交给我`.
- State changes preload the incoming first frame and crossfade for 180 ms, preventing abrupt face, size, and anchor jumps.
- The transparent full-window receiver remains hit-testable: drag the pet to move the window, or drop an image anywhere over its bounds to start lookup.
- The window is kept visible when clicking the desktop.
- Double-clicking the pet opens today's review when words are due, otherwise it opens the dictionary. Right-clicking provides explicit dictionary, today-review, and quit actions.

The desktop dropper is local-only. It posts the dragged image to the local backend, receives a temporary handoff key, then opens the local web app with that key.

Learning-state priority is time-sensitive: a correct answer briefly shows encouragement, a newly repeated mistake briefly shows focused review, older repeated mistakes fall back to the normal due state, due words show the reminder state, and an empty queue returns to idle. Historical mistakes therefore cannot permanently lock the Pet in focus.

For visual regression checks, rebuild the deterministic state frames and inspect both the still contact sheet and the animated key-state preview:

```bash
python3 scripts/build-unified-pet-animations.py
open desktop-dropper/assets/unified-pet-states-contact.png
open desktop-dropper/qa/animated/key-states.gif
```

The generated `unified-pet-animation-qa.json` rejects missing motion, anchor drift, opaque corners, and first-frame pairs whose mean pixel difference is below the visible-state threshold. It also verifies the actual ball, raised-paw, and tail tracks: each must move through a continuous 12-frame direction path with enough visible regional displacement. Individual state GIFs are written to `desktop-dropper/qa/animated/`. A single development state can also be injected without polling learning data:

```bash
open -na ".runtime-bin/Codex Pet 大王.app" --args --preview-state ready
```

Run the Codex Pet regression check:

```bash
npm run test:pet
```

The check verifies the single 12-frame ball-kick idle loop, every required v2 learning state, and PNG image parsing from the macOS drag pasteboard.

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

See [docs/SECURITY.md](docs/SECURITY.md).

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

## 版本状态

V2 已于 2026-07-31 暂时结项，作为当前稳定基线：Learning Standard、法律英语词库、冻结每日计划、复习流程、多入口学习助手、每日提醒与大王桌宠。

- multi-source Learning Standard structure
- progress tracked by `standardId`
- `learning-progress.json`
- Chinese `Learning Progress Summary.md`
- `GET /api/progress`
- Section 91 / Section 92 real closure validation
- online bilingual legal dictionary with AI legal enrichment
- OCR, webpage, PDF and desktop-drop entry points
- local vocabulary library and Ebbinghaus-style review scheduling
- Chrome study helper and learning-aware macOS companion

后续改进进入 V2.x 或下一里程碑，不回写 V2 基线。当前已知限制包括：iPhone iCloud 提醒同步与零重复事项仍需单独设备验证；7 天真实耗时校准只提出建议，不自动修改每日 20/10 配额。

项目不扩展为自动处理受限制考试材料的 Bar / NCA planner。考试机构和学习材料许可可能限制将授权材料输入、上传或传输到生成式 AI 工具；任何进一步的考试规划功能都必须先完成来源许可和合规边界设计。

当前产品定位：local-first legal English learning workspace and study-session closure layer for content the user is permitted to process.
