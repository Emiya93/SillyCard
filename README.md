# SillyCard

## 项目简介

SillyCard 是一个基于 `React 19 + Vite + TypeScript` 构建的单页应用，主打沉浸式手机风格的角色扮演交互界面。

从当前代码结构来看，主要功能包括：

- 对话与剧情推进
- 手机内应用界面与生成内容
- 角色状态管理，以及存档 / 读档支持
- 通过 `ST_API` 和 `postMessage` 与 SillyTavern 进行可选集成

这个仓库是前端应用，不是独立后端服务。本地开发主要依赖 Vite、浏览器，以及外部 AI API。

## 在 VS Code 中运行

### 前置条件

- Node.js 20 及以上
- 在 Windows 上，建议使用仓库内提供的 VS Code 任务，或直接使用 `npm.cmd`

当前工作区已验证可在 `Node v22.17.0` 下运行。

### 1. 安装依赖

可以任选以下方式：

- `Terminal -> Run Task -> Install dependencies`
- `npm.cmd install`

这个工作区默认优先使用 `npm.cmd`，以避免 PowerShell 执行策略拦截 `npm.ps1`。

### 2. 配置环境变量

基于 [.env.example](.env.example) 创建 `.env.local`，至少填写主 AI 配置：

```env
VITE_MAIN_AI_API_BASE=https://api.openai.com/v1
VITE_MAIN_AI_API_KEY=your_key_here
VITE_MAIN_AI_MODEL=gpt-4o-mini
```

可选变量：

- `VITE_CONTENT_AI_*`：用于单独配置内容生成模型
- `VITE_OPENAI_*` 或 `VITE_AI_*`：兼容旧配置名的别名
- `GEMINI_API_KEY`：仅用于遗留的 `services/geminiService.ts` 路径

`contexts/SettingsContext.tsx` 会把这些 `VITE_*` 变量作为应用默认设置加载，因此首次启动时可以直接带着预填好的 AI 配置，而不必手动输入。

### 3. 从 VS Code 启动

仓库内已包含：

- [.vscode/tasks.json](.vscode/tasks.json)：安装依赖、启动开发服务器、构建任务
- [.vscode/launch.json](.vscode/launch.json)：一键启动 Vite 并用 Edge 调试
- [.vscode/settings.json](.vscode/settings.json)：将当前工作区终端默认切换为 Command Prompt

推荐流程：

1. 按 `F5`
2. 选择 `Vite: run and debug in Edge`

也可以手动执行：

```bash
npm.cmd run dev
```

默认本地地址：[http://localhost:3000](http://localhost:3000)

## 构建

```bash
npm.cmd run build
```

执行 `npm.cmd run build` 后，会在 `dist/sillytavern/` 下额外生成一套 SillyTavern 专用产物：

- `dist/sillytavern/wenwan-sillytavern-character-card.json`：嵌入前端页面的角色卡 JSON，结构与仓库内提供的示例角色卡一致
- `dist/sillytavern/sillytavern-host.html`：从角色卡中提取出来的独立宿主 HTML 文件

兼容性说明：

- 构建后只保留一个角色卡 JSON：`dist/sillytavern/wenwan-sillytavern-character-card.json`
- 生成的角色卡会通过 `data.extensions.regex_scripts` 启动嵌入式前端，并沿用示例角色卡相同的 `first_mes = "1"` 触发方式
- 嵌入页面地址固定为 `http://127.0.0.1:3000/`
- 这意味着你的 SillyTavern 环境需要具备与示例角色卡一致的执行条件，例如嵌入式 regex scripts，以及现有的渲染 / 辅助脚本支持
- 如果你只想手动生成单个产物，可以使用 `npm.cmd run generate:character-card` 或 `npm.cmd run generate:sillytavern-host`

如果你只是想确认 UI 能否正常打开，那么即使没有 API Key，应用依然可以启动；但所有依赖 AI 的交互都需要有效的 API 配置后才能正常工作。
