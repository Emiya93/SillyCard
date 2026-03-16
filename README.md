# SillyCard

## What This Project Does

SillyCard is a `React 19 + Vite + TypeScript` single-page app with an immersive phone-style roleplay UI.
From the codebase, the main features are:

- dialogue and story progression
- in-app phone screens and generated phone content
- character status and save/load support
- optional SillyTavern integration through `ST_API` and `postMessage`

This repository is a frontend app, not a standalone backend service. Local development mainly depends on Vite, a browser, and an external AI API.

## Run In VS Code

### Prerequisites

- Node.js 20+
- On Windows, use the provided VS Code tasks or `npm.cmd`

This workspace has been checked with `Node v22.17.0`.

### 1. Install dependencies

Use either of these:

- `Terminal -> Run Task -> Install dependencies`
- `npm.cmd install`

The workspace is configured to prefer `npm.cmd` so PowerShell execution policy does not block `npm.ps1`.

### 2. Configure environment variables

Create `.env.local` from [.env.example](.env.example) and fill at least the main AI settings:

```env
VITE_MAIN_AI_API_BASE=https://api.openai.com/v1
VITE_MAIN_AI_API_KEY=your_key_here
VITE_MAIN_AI_MODEL=gpt-4o-mini
```

Optional variables:

- `VITE_CONTENT_AI_*` for a separate content-generation model
- `VITE_OPENAI_*` or `VITE_AI_*` as backward-compatible aliases
- `GEMINI_API_KEY` only for the legacy `services/geminiService.ts` path

`contexts/SettingsContext.tsx` now loads these `VITE_*` values as the app's default settings, so the app can start with prefilled AI config instead of requiring manual input on first run.

### 3. Start from VS Code

The repository now includes:

- [.vscode/tasks.json](.vscode/tasks.json) for install, dev server, and build tasks
- [.vscode/launch.json](.vscode/launch.json) for one-click Vite launch and Edge debugging
- [.vscode/settings.json](.vscode/settings.json) to use Command Prompt in this workspace

Recommended flow:

1. Press `F5`
2. Choose `Vite: run and debug in Edge`

Or run manually:

```bash
npm.cmd run dev
```

Default local URL: [http://localhost:3000](http://localhost:3000)

## Build

```bash
npm.cmd run build
```

If you only want to confirm that the UI opens, the app can still start without an API key. AI-driven interactions will fail until a valid API configuration is provided.
