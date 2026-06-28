# 安全说明 / Security

Learning Closure Agent v0.1 是本地优先、用户触发式的学习收尾工具。

## 核心原则

- 本地优先：学习数据默认保存在本机。
- 用户触发：只有用户点击 capture 按钮时才读取当前页面内容。
- 最小权限：Chrome extension 只申请 v0.1 必需权限。
- API key 不进入前端。

## 本项目不会做什么

- 不读取 cookies。
- 不读取 browser history。
- 不读取 localStorage 或 sessionStorage。
- 不后台监听网页。
- 不自动同步所有网页。
- 不读取用户文件系统中的任意文件。
- 不读取密码字段。
- 不上传内容到未配置的第三方服务。

## Capture 行为

Extension 只在用户点击以下按钮时 capture：

- Capture Current Page
- Capture Selected Text
- Manual Paste Text

Captured content 会发送到本地 server。只有在 `USE_MOCK_LLM=false` 时，本地 server 才会把 captured content 发送给配置的 LLM API。

## API Key

- API key 只允许放在 `server/.env`。
- 前端 extension 不得暴露 API key。
- server console 不得打印 `OPENAI_API_KEY`。
- 不得打印完整 `.env` 内容。

## 不得提交 GitHub 的内容

以下内容不得提交到 GitHub：

- `.env`
- `server/.env`
- `output/`
- `node_modules/`
- `dist/`
- `server/dist/`
- `extension/dist/`

当前 `.gitignore` 已包含这些路径。

## 本地数据

默认本地保存：

- Markdown learning closure
- `learning-log.json`
- `classification-corrections.json`

这些文件可能包含学习内容、个人笔记或纠错记录，应默认视为私人数据。

## Chrome 权限

当前 extension 权限：

- `activeTab`
- `scripting`
- `storage`

当前 host permissions：

- `http://localhost:3333/*`
- `https://chatgpt.com/*`
- `https://notebooklm.google.com/*`
- `https://www.youtube.com/*`

没有申请：

- `cookies`
- `history`
- `<all_urls>`
