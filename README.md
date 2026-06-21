# TechPro (Super)

Desktop app for YouTube and TikTok: profiles (MostLogin), automation, uniqualization, results checker, analytics.

## Stack

- Electron 33 + React 18 + Vite 5 + Tailwind CSS + Framer Motion
- electron-store, electron-updater, axios, i18next, zustand

## Quick start

```bash
npm install
npm run dev
```

## Requirements (end user)

- **TechPro installer** — Python 3.11 + Playwright bundled inside
- **MostLogin** client with Local API enabled (`http://127.0.0.1:30898`)
- **FFmpeg** — optional, for uniquizer only

## Build & release

```bash
npm run build:win      # local installer in release/
npm run build:publish  # build + upload to GitHub Releases (needs GH_TOKEN)
```

See **RELEASE_CHECKLIST.md** and **INSTALL_RU.md**.

## Updates

Installed via **Setup** checks [GitHub Releases](https://github.com/ProkStudio/super/releases) automatically (Cabinet → Check for updates).
