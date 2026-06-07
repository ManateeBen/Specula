<div align="center">

# 📖 Specula

**An AI-assisted desktop reader for PDF & EPUB — explain selections, quiz yourself, and get targeted teaching on your weak spots, powered by DeepSeek.**

**AI 辅助桌面阅读器 — 支持 PDF / EPUB，划线解释、章节测验与薄弱点智能教学，由 DeepSeek 驱动。**

[English](#english) · [中文](#中文)

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)

</div>

---

## English

Specula is a local-first desktop reading app that turns any PDF or EPUB into an interactive
learning experience. Select a passage to get an AI explanation in the teaching style you
prefer, generate a quiz for the current chapter, and let the AI diagnose your weak points
with tailored mini-lessons. Your books and API key never leave your machine.

### ✨ Features

- **📚 Library** — Import PDF and EPUB books; covers and metadata are extracted automatically.
- **📖 Reader**
  - EPUB: chapter-by-chapter rendering with inlined images and native text selection.
  - PDF: full document viewing with chapter jumps.
  - Reading progress is saved automatically.
- **💡 AI highlight explanations** — Select any text and get an explanation in one of four
  teaching styles, streamed in real time:
  - **Direct** — clear, structured explanation
  - **Socratic** — guiding questions instead of answers
  - **Feynman** — plain-language explanation with a recap prompt
  - **Analogy** — everyday analogies for abstract concepts
- **📝 Chapter quizzes** — AI generates multiple-choice, fill-in-the-blank, and short-answer
  questions from the chapter; short answers are graded by the AI.
- **🎯 Weak-point analysis** — After a quiz, the AI diagnoses your weak knowledge points and
  writes targeted mini-lessons.
- **🔒 Private by design** — Books, reading data, and your encrypted DeepSeek API key are
  stored locally (SQLite + encrypted local store). Nothing is uploaded except your prompts
  to the DeepSeek API.

### 🛠 Tech Stack

| Area | Stack |
| --- | --- |
| Shell / UI | Electron 33 · Vite 6 · React 18 · TypeScript · Tailwind CSS · React Router (HashRouter) · Zustand |
| Storage | SQLite via `sql.js` (WASM) · encrypted settings via `electron-store` |
| EPUB | Parsed in the main process with `jszip` + `@xmldom/xmldom`; chapters rendered as HTML |
| PDF | `pdf.js` / `@react-pdf-viewer` (worker bundled locally) |
| AI | DeepSeek API (OpenAI-compatible) via the `openai` SDK, streaming |

### 🚀 Getting Started

Requirements: **Node.js 18+** (Node 20/22/24 tested) and npm.

```bash
npm install
npm run dev        # launch in development
```

### 📦 Build

```bash
npm run build:win   # Windows installer → release/Specula Setup 0.1.0.exe
npm run pack:win    # unpacked build for debugging → release/win-unpacked/Specula.exe
```

> The installer (NSIS) lets you choose the install location and creates desktop and
> Start-menu shortcuts. `macOS` (dmg) and `Linux` (AppImage) targets are also configured.

### ⚙️ Configuration

On first run, open **Settings** and paste your [DeepSeek](https://platform.deepseek.com/)
API key, then click **Test Connection**. The default model is `deepseek-chat`. The key is
stored encrypted on your machine and is only sent to the DeepSeek API.

### 📁 Data Location

Everything lives under your OS user-data directory (e.g. `%APPDATA%/Specula` on Windows):

- `specula.db` — books, chapters, highlights, quizzes, progress (SQLite)
- `books/` — imported book files
- `covers/` — extracted cover images
- `settings.json` — encrypted app settings (incl. API key)

### 🏗 Architecture Notes

- The Electron **main process is built as CommonJS** (the project is intentionally not
  `"type": "module"`), because Electron's Node crashes loading these CJS deps via ESM interop.
- The renderer uses **`HashRouter`** because it is loaded from `file://` in the packaged app.
- **EPUB** is parsed and rendered without `epub.js` at runtime (it is browser-only and
  unreliable with in-memory archives in Electron); chapters are produced server-side as
  self-contained HTML with images inlined, which also enables native text selection.

### 📄 License

Released under the [MIT License](LICENSE).

---

## 中文

Specula 是一款**本地优先**的桌面阅读应用，把任意 PDF 或 EPUB 变成可交互的学习体验：
划选一段文字即可获得你偏好风格的 AI 讲解，为当前章节生成测验，并让 AI 诊断你的薄弱点、
给出针对性的 mini-lesson。你的书籍和 API Key 始终留在本机。

### ✨ 功能

- **📚 书库** — 导入 PDF、EPUB 电子书，自动提取封面与元数据。
- **📖 阅读器**
  - EPUB：逐章渲染，图片内联，原生文本选区。
  - PDF：全文阅读，支持章节跳转。
  - 自动保存阅读进度。
- **💡 AI 划线解释** — 选中任意文字，以四种教学方式实时流式讲解：
  - **直述式** — 清晰、结构化的解释
  - **苏格拉底式** — 用引导性问题启发思考
  - **费曼式** — 用最简单的语言解释并请你复述
  - **类比式** — 用生活化类比理解抽象概念
- **📝 章节测验** — AI 根据章节内容生成选择题 / 填空题 / 简答题，简答题由 AI 评分。
- **🎯 薄弱点分析** — 测验后，AI 诊断薄弱知识点并撰写针对性 mini-lesson。
- **🔒 隐私优先** — 书籍、阅读数据与加密后的 DeepSeek API Key 均存储在本地
  （SQLite + 加密本地存储），除发送给 DeepSeek API 的提示词外不上传任何内容。

### 🛠 技术栈

| 模块 | 技术 |
| --- | --- |
| 外壳 / 界面 | Electron 33 · Vite 6 · React 18 · TypeScript · Tailwind CSS · React Router (HashRouter) · Zustand |
| 存储 | `sql.js`（WASM SQLite）· `electron-store`（加密设置） |
| EPUB | 主进程用 `jszip` + `@xmldom/xmldom` 解析，章节以 HTML 渲染 |
| PDF | `pdf.js` / `@react-pdf-viewer`（worker 本地打包） |
| AI | DeepSeek API（OpenAI 兼容），`openai` SDK，流式输出 |

### 🚀 开发

环境要求：**Node.js 18+**（已在 Node 20/22/24 验证）与 npm。

```bash
npm install
npm run dev        # 开发模式启动
```

### 📦 构建

```bash
npm run build:win   # Windows 安装包 → release/Specula Setup 0.1.0.exe
npm run pack:win    # 免安装调试版 → release/win-unpacked/Specula.exe
```

> 安装包（NSIS）支持选择安装目录，并自动创建桌面和开始菜单快捷方式。同时配置了
> `macOS`（dmg）与 `Linux`（AppImage）构建目标。

### ⚙️ 配置

首次使用请打开「**设置**」，填入 [DeepSeek](https://platform.deepseek.com/) API Key，
并点击「**测试连接**」。默认模型为 `deepseek-chat`。Key 会被加密存储在本机，仅发送给
DeepSeek API。

### 📁 数据位置

所有数据位于操作系统用户数据目录（Windows 下为 `%APPDATA%/Specula`）：

- `specula.db` — 书籍、章节、划线、测验、进度（SQLite）
- `books/` — 导入的书籍文件
- `covers/` — 提取的封面图片
- `settings.json` — 加密的应用设置（含 API Key）

### 🏗 架构说明

- Electron **主进程以 CommonJS 构建**（项目特意不使用 `"type": "module"`），因为 Electron
  的 Node 在通过 ESM 互操作加载这些 CJS 依赖时会崩溃。
- 渲染端使用 **`HashRouter`**，因为打包后页面以 `file://` 加载。
- **EPUB** 运行时不使用 `epub.js`（它是纯浏览器库，在 Electron 中用内存归档渲染不稳定）；
  章节在主进程侧生成为图片内联的自包含 HTML，同时获得原生文本选区能力。

### 📄 许可证

基于 [MIT License](LICENSE) 发布。
