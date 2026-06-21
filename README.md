# Nexus Toolkit

Desktop app for YouTube channel management: profiles (MostLogin), automation, uniqualization, results checker, analytics.

## Stack

- Electron 33 + React 18 + Vite 5 + Tailwind CSS + Framer Motion
- electron-store, axios, i18next, zustand

## Quick start

```bash
npm install
npm run dev
```

## Requirements (end user)

- **TechPro installer** — Python 3.11 + Playwright + Chromium are **bundled inside** (no separate install)
- **MostLogin** client with Local API enabled (`http://127.0.0.1:30898`)
- **FFmpeg** — optional, for uniquizer only (`resources/bin/win/` or system PATH)
- API keys (optional): YouTube Data API, SpaceProxy, DeepSeek, Telegram

## Build (developer)

```bash
npm install
npm run build:win
```

`build:win` runs `scripts/bundle_python.ps1` (downloads Python embed + Playwright Chromium ~800 MB), then builds the installer.

Output in `release/`:

- `TechPro Setup 2.0.4.exe` — NSIS installer (~450 MB)
- `TechPro 2.0.4.exe` — portable

End-user guide: **INSTALL_RU.md**

## Project structure

- `electron/` — main process, IPC, services
- `src/` — React UI
- `scripts/` — Python automation stubs (warmup, QR, upload, jokes)
- `resources/` — FFmpeg binaries

## MostLogin API

See [MostLogin Developer Guide](https://apidocs.mostlogin.com/)
