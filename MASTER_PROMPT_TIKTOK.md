# MASTER PROMPT: TikTok Warmup + Smart Commenting для TechPro

> **Версия:** 1.0  
> **Дата:** 2026-06-17  
> **Базовые проекты:**  
> - `c:\Users\HONOR\Desktop\traffic\Super` — TechPro v2.0.4 (YouTube, Electron+React+Python Playwright)  
> - `c:\Users\HONOR\Desktop\traffic\copy` — Cheat/TruwasNexus 3.0 (референс UI, TikTok-модуль, FastAPI backend)

---

## 0. Цель продукта

Расширить **TechPro** (Super) модулем **TikTok**: прогрев аккаунтов и **умный комментинг** под конкретные видео. Комментинг — не «спам под случайными роликами», а **таргетированная работа с комментариями под заданными ссылками**:

1. Пользователь загружает **список URL видео** (1..N штук) и **пул текстов** (~200 вариантов комментариев/ответов).
2. Софт открывает каждое видео, анализирует секцию комментариев.
3. **Фаза A — топ-комментарии:** отвечает на **первые 10 комментариев с наибольшим числом лайков** (reply в ветку, не корневой коммент).
4. **Фаза B — «пустые» ветки:** скроллит вниз, находит комментарии с **0, 1 или 2 ответами** (настраиваемый порог), отвечает туда.
5. Между действиями — человеческие задержки, ротация аккаунтов, лимиты, дедупликация.

**UI/UX** — уровень Cheat (copy): тёмная тема, карточки, Radix-tabs, плавные анимации, **плавающий переключатель платформ слева снизу** (YouTube ↔ TikTok, с заделом под Instagram/Telegram).

---

## 1. Архитектурное решение (рекомендация)

### 1.1 Что берём из Super (не переписывать)

| Компонент | Путь / паттерн | Зачем |
|-----------|----------------|-------|
| Electron shell | `electron/main.js`, `preload.js` | IPC, frameless window, single-instance |
| React + Vite + Tailwind | `src/` | Весь фронтенд |
| Zustand UI state | `src/store/useAppStore.js` | Навигация, тема, toasts |
| electron-store | `electron/services/store.js` | Персистентные данные |
| Python Playwright CDP | `scripts/common/session_runner.py` | Автоматизация через антидетект |
| HumanSimulator | `scripts/common/human_sim.py` | Человеческие клики/задержки |
| Browser providers | `electron/services/browserProfiles.js` | MostLogin / Vision / Zenno |
| Account blocks | `electron/services/accountImport.js` | `email:password:totp` |
| Proxy management | Profiles page + SpaceProxy | Массовое создание, dead proxy list |
| Task chains | `electron/services/taskRunner.js` | Цепочки режимов |
| i18n ru/en | `src/i18n/` | Локализация |
| Theme system | `src/constants/themePresets.js` | Пресеты цветов, dark/light |

### 1.2 Что берём из copy (референс, адаптировать)

| Компонент | Источник | Зачем |
|-----------|----------|-------|
| Design tokens | `copy/_asar_extract/frontend/dist/assets/index-BbHylkpr.css` | `#0a0a0b` bg, `#111113` card, `#3b82f6` primary |
| Platform switcher | Zustand `setActiveModule` (`copy/tools/_wie_dump.txt`) | `activeModule: youtube \| tiktok \| instagram \| telegram` |
| TikTok warmup logic | `copy/resources/agent-src/modules/tiktok/workers/warmup.py` | FYP scroll, like/follow prob |
| Comment gen (база) | `copy/.../comment_gen.py` | Spintax, AI fallback, 150 char limit |
| Comment marketing (база) | `copy/.../comment_marketing.py` | DOM селекторы, post flow |
| Per-module settings | `moduleTgConfig`, `tiktokActiveBrowser` | Изолированные настройки по платформе |
| Floating dock UI | Cheat bundle (bottom-left) | 4 иконки платформ, ring-2 ring-primary на активной |

### 1.3 Что НЕ копировать из copy

- **Отдельный FastAPI backend на :8642** — в Super всё через Electron IPC + Python scripts; не плодить второй процесс без необходимости.
- **License gating** — в TechPro нет модульных лицензий; переключатель платформ без активации.
- **Comment marketing через video_finder** (хэштеги/конкуренты) — заменяем на **таргетированные URL + smart reply strategy** (см. §4).

### 1.4 Целевая архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│  Renderer (React 18 + Zustand)                                  │
│  ├── activeModule: 'youtube' | 'tiktok'                         │
│  ├── PlatformDock (fixed bottom-left)                           │
│  ├── YouTube routes (существующие страницы)                     │
│  └── TikTok routes (новые страницы)                             │
│       ├── TikTokAccounts                                        │
│       ├── TikTokAutomation (warmup + comment)                   │
│       ├── TikTokCampaigns (видео + пул комментов)               │
│       └── TikTokResults / Analytics                             │
└────────────────────────┬────────────────────────────────────────┘
                         │ window.nexusAPI (расширить IPC)
┌────────────────────────▼────────────────────────────────────────┐
│  Electron Main                                                  │
│  ├── store.js (+ tiktok: accounts, campaigns, results)          │
│  ├── taskRunner.js (+ tiktok_warmup, tiktok_comment)            │
│  └── pythonRunner.js                                            │
└────────────────────────┬────────────────────────────────────────┘
                         │ CDP sessions JSON
┌────────────────────────▼────────────────────────────────────────┐
│  Python scripts                                                 │
│  ├── scripts/tiktok/warmup.py          (NEW)                    │
│  ├── scripts/tiktok/smart_comment.py   (NEW — killer feature)   │
│  ├── scripts/tiktok/comment_parser.py    (NEW — DOM scrape)       │
│  └── scripts/common/*                  (reuse)                  │
└────────────────────────┬────────────────────────────────────────┘
                         │ connect_over_cdp
┌────────────────────────▼────────────────────────────────────────┐
│  Anti-detect browsers (MostLogin / Vision / Zenno)              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. UI/UX — дизайн как в Cheat (copy)

### 2.1 Визуальная система

**Обязательные токены** (привести Super к единому стилю с copy):

```css
--color-background: #0a0a0b;
--color-card: #111113;
--color-sidebar: #09090b;
--color-border: #27272a;
--color-muted-foreground: #a1a1aa;
--color-primary: #3b82f6; /* или purple #a855f7 — сохранить TechPro accent как опцию */
--radius-xl: 12px;
--radius-2xl: 16px;
```

- **Карточки:** `rounded-xl border border-border bg-card p-6 space-y-6`
- **Заголовки секций:** `text-lg font-semibold border-b border-border pb-4 mb-6`
- **Акцент (по решению пользователя):** тёмный фон + **золотой** primary `#d4af37`, glow `rgba(212,175,55,0.25)`
- **Primary button:** filled gold, `h-9 px-4 rounded-lg`
- **Модалки:** `fixed inset-0 bg-black/60 backdrop-blur-sm z-50`
- **Терминал логов:** monospace, цвета INFO/SUCCESS/ERROR/WARNING
- **Анимация страниц:** Framer Motion fade+slide (уже есть в Super)
- **Scrollbars:** 6px, тонкие

### 2.2 Platform Dock (слева снизу) — КРИТИЧНО

**Позиция:** `fixed bottom-6 left-6 z-40`

**Внешний вид:**
- Контейнер: `flex gap-2 p-2 rounded-2xl bg-card/80 backdrop-blur-md border border-border shadow-xl`
- Кнопки: иконки YouTube (красный), TikTok (белый/чёрный), опционально Instagram, Telegram — **серые если модуль не активен**
- Активная платформа: `ring-2 ring-primary scale-105`
- Tooltip при hover: название платформы
- При переключении: `setActiveModule('tiktok')` + восстановление `moduleLastRoute[tiktok]`

**Поведение:**
- Переключение **не перезагружает** приложение — меняется набор пунктов sidebar и активная страница
- Sidebar для TikTok: Profiles (общие), Automation, Results (+ общие Settings)
- Sidebar для YouTube: текущие пункты без изменений
- Settings: общие (appearance, hotkeys) + вкладки per-platform (browser provider, API keys)

### 2.3 Новые страницы TikTok

#### 2.3.1 TikTok Accounts (минимальный, v1)

> **По решению пользователя:** импорт не нужен — ручной логин в MostLogin-профилях.

- Привязка profile ↔ метка (имя для логов)
- Статусы: active, banned, logged_out, verify
- Без ролей, без массового импорта, без блоков
- Страница опциональна в v1 — достаточно Profiles + Automation

#### 2.3.2 TikTok Automation — Smart Comment (пресеты)

> **По решению пользователя:** без страницы Campaigns — всё через **пресеты автоматизации** (как YouTube Automation).

**Пресет smart_comment** = saved automation config:

```
Preset {
  id, name, module: 'tiktok', mode: 'smart_comment',
  videoUrls: string[],           // ссылки на видео (1 на строку)
  commentPool: string[],         // ~200 вариантов (textarea + import .txt)
  commentPoolMode: 'random' | 'sequential' | 'weighted' | 'ai_rewrite',
  
  // Smart reply strategy (всё настраиваемо в UI)
  replyStrategy: {
    phaseTopEnabled: true,
    phaseTopCount: 10,           // default 10, настраиваемо
    phaseEmptyEnabled: true,
    maxRepliesPerComment: 2,     // порог 0/1/2 — настраиваемо
    scrollDepth: 'auto' | number,
    skipOwnComments: true,
    skipPinnedComments: false,
    rootCommentEnabled: false,   // опционально 1 корневой коммент после replies
    rootCommentText: '',         // или random из pool
  },
  
  // AI (только OpenRouter)
  ai: { useAi: false, model: 'nvidia/nemotron-3-ultra-550b-a55b:free' },
  
  // Лимиты (всё настраиваемо)
  limits: {
    commentsPerAccountPerDay: 15,
    commentsPerVideo: 20,
    delayMinSec: 25,
    delayMaxSec: 90,
    pauseBetweenVideosMinSec: 60,
    pauseBetweenVideosMaxSec: 180,
  },
  
  // Доп. действия
  actions: {
    doLikeParentComment: false,  // опционально + likeProb %
    likeParentProb: 30,
    doFollowAuthor: false,
    followProb: 10,
  },
  
  // Капча (все варианты — выбор в settings)
  onCaptcha: 'stop' | 'switch_account' | 'manual_pause',
  
  profileIds: string[]
}
```

**UI Automation (вкладка Smart Comment):**
- Секции: Video URLs | Comment Pool | Strategy | Limits | Profiles
- Video URLs: textarea + import .txt
- Comment Pool: большой textarea + счётчик + spintax preview
- Strategy: слайдеры phaseTopCount, maxRepliesPerComment, toggle rootComment
- Сохранение пресета: Ctrl+Shift+S (как YouTube)

#### 2.3.3 TikTok Automation (`/tiktok/automation`)
Два режима (как YouTube Automation):

**Режим 1: Warmup**
- Выбор профилей, threads
- Слайдеры: duration, watch time, like prob, follow prob
- Доп. опции (см. §3)

**Режим 2: Smart Comment** (привязка к кампании или inline config)
- Выбор кампании из списка ИЛИ быстрый режим (URL + pool прямо на странице)
- Выбор аккаунтов-комментаторов
- Threads, Run/Stop
- TerminalLog в реальном времени

#### 2.3.4 TikTok Results (`/tiktok/results`)

> **По решению пользователя:** минимальная статистика.

- Таблица: video URL | количество оставленных комментов | дата последнего запуска | пресет
- Без детализации каждого reply (в v1)
- Export CSV опционально

---

## 3. TikTok Warmup — функционал и настройки

### 3.1 Базовый flow (из copy `warmup.py`, адаптировать под Super)

1. Открыть `https://www.tiktok.com/foryou`
2. Проверка: logged in, captcha, ban/shadowban heuristics
3. Цикл до `duration_min..duration_max` минут:
   - Смотреть видео `watch_min_sec..watch_max_sec`
   - Лайк с вероятностью `like_prob` %
   - Подписка с вероятностью `follow_prob` %
   - Next: ArrowDown или smooth scroll
4. Логировать: watched, likes, follows

### 3.2 Расширенные настройки прогрева (регулировки для UI)

| Параметр | Тип | Default | Описание |
|----------|-----|---------|----------|
| `durationMin` / `durationMax` | int (мин) | 3–8 | Длительность сессии |
| `watchMinSec` / `watchMaxSec` | int | 4–20 | Время просмотра одного видео |
| `likeProb` | 0–100 | 25 | Вероятность лайка |
| `followProb` | 0–100 | 5 | Вероятность подписки |
| `commentProb` | 0–100 | 0 | Вероятность оставить корневой коммент (не reply) |
| `commentTexts` | string[] | [] | Пул текстов для корневых комментов при прогреве |
| `saveProb` | 0–100 | 10 | Сохранить в избранное |
| `shareProb` | 0–100 | 0 | Поделиться |
| `soundOnProb` | 0–100 | 70 | Не mute (клик по видео) |
| `pauseBetweenVideosMin` / `Max` | int (ms) | 800–2200 | Пауза между видео |
| `maxVideosPerSession` | int | 0 (unlimited) | Лимит видео за сессию |
| `nicheHashtags` | string[] | [] | Переходить в нишу через поиск/хэштег (опционально) |
| `nicheMode` | enum | `fyp_only` | `fyp_only` \| `hashtag_mix` \| `search_mix` |
| `nicheMixRatio` | 0–100 | 20 | % времени в нише vs FYP |
| `skipAds` | bool | true | Пытаться пропускать рекламу |
| `humanMicroActions` | bool | true | Случайные движения мыши, микроскроллы |
| `restEveryNMinutes` | int | 0 | Пауза-отдых каждые N минут |
| `restDurationSec` | int | 60 | Длительность отдыха |
| `dailyWarmupLimit` | int | 3 | Макс. сессий прогрева в день на аккаунт |
| `stopOnCaptcha` | bool | true | Остановить при капче |
| `stopOnVerify` | bool | true | Остановить при запросе верификации |
| `telegramNotify` | bool | false | Уведомление в Telegram по завершении |

### 3.3 Цепочки задач (Tasks)

Добавить TikTok-режимы в task chains:
- `tiktok_warmup`
- `tiktok_smart_comment`
- `tiktok_login` (detect + manual assist)

Пример цепочки: `tiktok_warmup → tiktok_smart_comment`

---

## 4. Smart Commenting — детальная логика (KILLER FEATURE)

### 4.1 Входные данные

```json
{
  "videoUrls": [
    "https://www.tiktok.com/@user/video/1234567890",
    "https://vm.tiktok.com/xxxxx/"
  ],
  "commentPool": [
    "согласен, {круто|огонь|топ} 🔥",
    "а что думаешь про {это|такой подход}?",
    "... ещё ~200 вариантов ..."
  ],
  "config": { /* см. Campaign.replyStrategy + limits + promotion */ }
}
```

### 4.2 Алгоритм на одно видео

```
OPEN video URL
WAIT page load + random 2-5 sec
OPTIONAL: like video (likeProb)
OPTIONAL: follow author (followProb)

EXPAND comment section if collapsed
PARSE all visible comments into array:
  Comment {
    id, author, text, likeCount, replyCount,
    isPinned, isOwn, elementRef
  }

PHASE A — Top comments by likes:
  SORT comments by likeCount DESC
  FILTER: not pinned (if skipPinned), not own (if skipOwn)
  TAKE first N (phaseTopCount, default 10)
  FOR EACH top_comment:
    PICK text from commentPool (random/sequential/weighted)
    OPTIONAL: apply spintax {a|b|c}
    OPTIONAL: AI rewrite (useAi + caption context)
    OPTIONAL: inject promotion (product, @profile, cta)
  ENSURE text <= 150 chars
    CLICK reply on parent comment
    TYPE with human keyboard (char by char, 30-130ms)
    SUBMIT (comment-post button or Enter)
    LOG success/fail
    DELAY delayMinSec..delayMaxSec
    TRACK in results DB (dedup: same account + video + parentCommentId)

PHASE B — Low-reply comments:
  SCROLL comment section down (repeat scrollDepth times or until no new comments)
  RE-PARSE comments
  FILTER: replyCount <= maxRepliesPerComment (0, 1, or 2)
  FILTER: not already replied by us
  FILTER: not in Phase A set (dedup)
  SORT: prefer replyCount ASC, then likeCount DESC (пустые первыми)
  FOR EACH qualifying comment (until commentsPerVideo limit):
    same REPLY flow as Phase A
    DELAY

CLOSE / next video
```

### 4.3 Парсинг комментариев (DOM — `comment_parser.py`)

**Селекторы TikTok (best-effort, из copy + расширить):**

```python
_COMMENT_ITEM = '[data-e2e="comment-item"], div[class*="CommentItem"]'
_COMMENT_TEXT = '[data-e2e="comment-level-1"] p, span[data-e2e="comment-level-1"]'
_COMMENT_LIKES = '[data-e2e="comment-like-count"]'
_REPLY_COUNT = '[data-e2e="comment-reply-count"]'  # может отсутствовать → 0
_REPLY_BTN = '[data-e2e="comment-reply-1"], span[data-e2e="comment-reply"]'
_COMMENT_INPUT = '[data-e2e="comment-input"], div[contenteditable="true"][role="textbox"]'
_COMMENT_POST = '[data-e2e="comment-post"]'
_LOAD_MORE = '[data-e2e="view-more-comments"], button:has-text("View more")'
```

**Важно:**
- TikTok lazy-loads comments → нужен цикл scroll + wait + re-parse
- Like count может быть "1.2K" → парсер `parse_count("1.2K") → 1200`
- Обфусцированные классы меняются → fallback селекторы + периодическое обновление
- Детект «свой коммент» по username аккаунта в DOM

### 4.4 Выбор текста из пула

| Mode | Логика |
|------|--------|
| `random` | `random.choice(commentPool)` + spintax |
| `sequential` | Round-robin index per account (сохранять в session state) |
| `weighted` | Веса в формате `текст\|weight` |

**Spintax:** `{привет|здарова|хай}` → случайный вариант (из copy `expand_spintax`)

**AI mode (опционально):**
- OpenRouter (единственный AI-провайдер для TikTok-комментов)
- Промпт: короткий нативный reply ≤150 символов, язык видео, контекст parent comment
- Fallback на template если AI fail

**Promotion injection (из copy `_ensure_promotion`):**
- `mentionProduct`, `mentionProfile`, `mentionAt` — аккуратно дописать если нет в тексте

### 4.5 Ротация аккаунтов

```
FOR each videoUrl in campaign.videoUrls:
  FOR each account in assignedAccounts (round-robin):
    IF account.dailyLimitReached: SKIP
    IF account.status != 'active': SKIP
    OPEN profile → RUN smart_comment on video
    INCREMENT account.dailyComments
    BREAK if video fully processed OR per-video limit reached
```

### 4.6 Дедупликация и антиспам

- **Глобальный dedup:** `(videoId, parentCommentId, accountId)` — не отвечать дважды
- **Кросс-аккаунт dedup (опционально):** не отвечать на тот же parent comment разными аккаунтами
- **Stop words:** не использовать слова из списка
- **Min unique text:** не повторять один текст на одном видео
- **Cooldown per video:** N часов между повторными визитами

### 4.7 Обработка ошибок

| Ситуация | Действие |
|----------|----------|
| Captcha | stop account, log, notify, optional switch account |
| Comment disabled | skip video, log |
| Rate limit / "try again" | exponential backoff, pause account |
| DOM not found | retry 3x, screenshot to logs folder, skip |
| Account logged out | mark status, stop |
| Shadowban heuristic | mark suspected, reduce limits |

---

## 5. Данные и хранение

### 5.1 Расширение electron-store

```javascript
// store.js additions
tiktok: {
  accounts: {
    blocks: [{ id, name, accounts: [{
      id, username, password, totp, role, status,
      profileId, dailyCommentsCount, dailyCommentsDate,
      aiApiKey?, targetAccount?, notes
    }]}],
    temp: []
  },
  campaigns: [{
    id, name, status, videoUrls, commentPool, commentPoolMode,
    replyStrategy: {...}, promotion: {...}, limits: {...}, actions: {...},
    assignedAccountIds, assignedProfileIds,
    createdAt, updatedAt
  }],
  results: [{
    id, campaignId, videoUrl, videoId,
    parentCommentId, parentCommentText, parentLikeCount,
    ourReplyText, accountId, profileId,
    phase: 'top' | 'empty',
    status: 'success' | 'error',
    errorMessage?, timestamp
  }],
  foundVideos: []  // dedup cache: { videoId, commented, lastVisited }
}
```

### 5.2 IPC handlers (новые)

```
tiktok:accounts:list|import|update|delete|check
tiktok:campaigns:list|create|update|delete|duplicate
tiktok:automation:runWarmup|runSmartComment|stop|status|logs
tiktok:results:list|export
settings:setActiveModule  // или в useAppStore + persist
```

### 5.3 Python scripts (новые)

```
scripts/tiktok/
├── __init__.py
├── warmup.py              # FYP warmup
├── smart_comment.py       # main orchestrator per session
├── comment_parser.py      # DOM scrape + sort
├── comment_poster.py      # reply flow (type, submit)
├── comment_gen.py         # pool pick, spintax, AI (port from copy)
└── verification.py        # login, captcha, ban checks
```

---

## 6. Аккаунты, прокси, сессии (TikTok)

### 6.1 Формат импорта

```
username:password
username:password:totp_secret
email:password  # если логин через email
```

### 6.2 Роли аккаунтов

| Роль | Назначение |
|------|------------|
| `main` | Основной аккаунт (контент, профиль) |
| `commenter` | Только комментинг |
| `warmup_only` | Только прогрев |

### 6.3 Сессии

- Как в Super: сессия = антидетект browser profile (CDP)
- TikTok login: manual в профиле → detect via `/@username` в DOM
- Не хранить cookies в electron-store — только в профиле браузера

### 6.4 Прокси

- Переиспользовать Profiles page (общая для обеих платформ)
- `profilesPerProxy`, dead proxy list, SpaceProxy API
- Опционально: отдельный `tiktokActiveBrowser` provider (если нужен другой антидетект для TT)

---

## 7. Настройки — полный список регулировок

### 7.1 Глобальные (Settings)

- language, appearance, colorTheme, fontSize, fontFamily
- sidebarCollapsed
- hotkeys
- telegram (per-module: youtube, tiktok)
- AI: deepseekApiKey, openrouterApiKey, aiBaseUrl, aiModel

### 7.2 TikTok Warmup (см. §3.2)

### 7.3 TikTok Smart Comment

| Категория | Параметры |
|-----------|-----------|
| **Strategy** | phaseTopCount, phaseTopEnabled, phaseEmptyEnabled, maxRepliesPerComment, scrollDepth, skipPinned, skipOwn |
| **Pool** | commentPoolMode, spintax enabled, AI enabled, AI model |
| **Promotion** | productName, targetAccount, ctaText, mention*, stopWords, materials |
| **Limits** | commentsPerAccountPerDay, commentsPerVideo, delayMin/Max, pauseBetweenVideos |
| **Actions** | doLike, likeProb, doFollow, followProb, doLikeParentComment |
| **Dedup** | crossAccountDedup, cooldownHours, minUniqueTexts |
| **Execution** | threads (1–20), profileIds, stopOnError threshold |

### 7.4 Automation presets

Сохранение/загрузка пресетов как в YouTube Automation (`automationPresets` + `module: 'tiktok'`)

---

## 8. i18n — ключевые строки

Добавить в `src/i18n/ru.json` и `en.json`:

```
tiktok.module.title
tiktok.accounts.*
tiktok.campaigns.*
tiktok.automation.warmup.*
tiktok.automation.smartComment.*
tiktok.results.*
platformDock.youtube / .tiktok / .instagram / .telegram
```

---

## 9. Этапы реализации (для AI-агента)

### Phase 1 — Foundation ✅
- [x] `activeModule` в Zustand + persist
- [x] `PlatformDock` component (bottom-left)
- [x] Conditional sidebar/routing по модулю
- [x] Store schema `tiktok.*`
- [x] IPC stubs

### Phase 2 — TikTok Accounts ✅
- [x] TikTokAccounts page (минимальный UI — без импорта, ручной логин)
- [x] ~~Import parser~~ — пропущен по решению пользователя
- [x] Link to profiles (profiles.meta: tiktokUsername, tiktokStatus, tiktokReady)
- [x] detect_login.py — порт из copy session_manager.py
- [x] tiktokRunner.js — проверка входа через CDP

### Phase 3 — Warmup ✅
- [x] `scripts/tiktok/warmup.py` (порт copy + поиск + save/share)
- [x] TikTok Automation page — warmup tab
- [x] tiktokRunner integration
- [x] TerminalLog + progress

### Phase 4 — Campaigns UI (1 неделя)
- [ ] TikTokCampaigns page (CRUD)
- [ ] Video URL + comment pool editors
- [ ] Strategy config UI with visual explainer

### Phase 5 — Smart Comment Engine (2 недели) ⭐
- [ ] `comment_parser.py` — scrape, sort, scroll
- [ ] `smart_comment.py` — Phase A + Phase B
- [ ] `comment_poster.py` — human type + submit
- [ ] `comment_gen.py` — pool + spintax + AI
- [ ] Dedup + results persistence
- [ ] TikTok Results page

### Phase 6 — Polish (1 неделя)
- [ ] Design tokens alignment with copy
- [ ] Task chains для TikTok
- [ ] Telegram notifications
- [ ] Guide/cheat sheet per page
- [ ] Error screenshots, retry logic

### Phase 7 — Testing
- [ ] Manual test on 2–3 real TT accounts
- [ ] DOM selector updates
- [ ] Rate limit handling

---

## 10. Критерии приёмки

1. **Platform dock** виден слева снизу, переключает YouTube ↔ TikTok без перезагрузки.
2. **Warmup** крутит FYP с настраиваемыми параметрами, логирует в TerminalLog.
3. **Campaign:** загрузка 5+ URL и 200+ комментов, сохранение, запуск.
4. **Phase A:** на тестовом видео отвечает на топ-10 комментов по лайкам.
5. **Phase B:** скроллит вниз, отвечает на комменты с ≤2 ответами.
6. **Дедуп:** повторный запуск не дублирует ответы.
7. **UI:** визуально на уровне copy (dark cards, blur modals, smooth animations).
8. **i18n:** ru + en для всех новых строк.
9. **Не ломает** существующий YouTube функционал.

---

## 11. Референсные файлы (читать при реализации)

### Super (база)
- `electron/main.js`, `electron/preload.js`, `electron/services/store.js`
- `electron/services/taskRunner.js`, `electron/services/pythonRunner.js`
- `src/App.jsx`, `src/store/useAppStore.js`
- `src/components/pages/Automation.jsx` — UI паттерн для automation
- `src/components/pages/Accounts.jsx` — UI паттерн для accounts
- `scripts/warmup.py`, `scripts/common/human_sim.py`, `scripts/common/session_runner.py`

### Copy (референс)
- `copy/_asar_extract/frontend/dist/assets/index-BbHylkpr.css` — design tokens
- `copy/tools/_wie_dump.txt` — platform switcher state
- `copy/resources/agent-src/modules/tiktok/workers/warmup.py`
- `copy/resources/agent-src/modules/tiktok/workers/comment_marketing.py`
- `copy/resources/agent-src/modules/tiktok/services/comment_gen.py`
- `copy/tools/HANDOFF_SMART_MODEL.md` — API contracts

---

## 12. Риски и митигация

| Риск | Митигация |
|------|-----------|
| TikTok меняет DOM | Множественные селекторы, fallback, screenshot on fail, быстрые патчи |
| Баны за комментинг | Лимиты, задержки, human typing, прогрев перед комментингом |
| 200 комментов — повторы | Spintax, AI rewrite, sequential mode, min unique check |
| RAM при многих threads | Как upload в Super — batch limits, sequential option |
| copy UI недоступен в source | Реконструировать по CSS tokens + скриншотам Cheat |

---

## 13. Prompt для AI-агента (копировать в Cursor)

```
Ты senior fullstack разработчик. Работаешь в проекте TechPro (c:\Users\HONOR\Desktop\traffic\Super).

ЗАДАЧА: Реализовать TikTok-модуль по спецификации MASTER_PROMPT_TIKTOK.md.

ПРАВИЛА:
1. Не ломай существующий YouTube функционал.
2. UI как в copy (Cheat): тёмная тема, карточки rounded-xl, PlatformDock bottom-left.
3. Архитектура Super: Electron IPC + Python Playwright CDP, НЕ отдельный FastAPI.
4. Killer feature: Smart Commenting — Phase A (top-10 by likes) + Phase B (≤2 replies).
5. Перед кодом — прочитай файлы из §11.
6. Минимальные диффы, match existing style.
7. i18n ru+en для всех строк.
8. Проверяй lint/build после изменений.

Начни с Phase N: [указать фазу]
```

---

---

## 14. Ответы пользователя (зафиксировано 2026-06-17)

> Эти решения имеют приоритет над общими рекомендациями выше.

### 14.1 Архитектура и платформы

| Решение | Значение |
|---------|----------|
| Бэкенд | На усмотрение агента по промпту (рекомендация: Electron IPC + Python, как Super) |
| Платформы в dock | **Все 4:** YouTube, TikTok, Instagram, Telegram (IG/TG — заглушки или минимальный скелет) |
| Акцент UI | **Тёмный + золотой** (`#d4af37` / `#f5c542` на `#0a0a0b`) — не фиолетовый TechPro, не синий copy |
| Язык UI | **Только русский** (i18n en — не приоритет) |
| Антидетект | **Только MostLogin** |
| Прокси | Все источники: ручная вставка, SpaceProxy API, импорт .txt |

### 14.2 Комментинг

| Решение | Значение |
|---------|----------|
| Режим | **Сначала replies** (Фаза A + B), **затем опционально** один корневой коммент под видео (если включено в настройках пресета) |
| Фаза A (топ по лайкам) | **Настраиваемо в UI**, default 10 |
| Фаза B (мало ответов) | **Настраиваемый порог** в UI (0 / 1 / 2 ответа) |
| Пул комментов | **Все режимы:** random, sequential, spintax, AI rewrite — переключаемые |
| AI | **Только OpenRouter** (`openrouter.ai/api/v1`) |
| Продвижение | **Нет** — только нативные тексты из пула, без product/@profile/CTA |
| Язык комментов | **Всегда русский** |
| Лайк parent-коммента | **Опционально** — галочка + вероятность % |
| Источник видео | **Только ручные URL** — без video_finder (хэштеги/конкуренты) |
| Дедуп cross-account | **Несколько аккаунтов** могут ответить на один parent-коммент |
| Капча/верификация | **Все варианты** в настройках: stop / switch account / manual pause |

### 14.3 Аккаунты

| Решение | Значение |
|---------|----------|
| Импорт | **Не нужен на старте** — пользователь вручную логинится в профилях MostLogin |
| Роли | **Нет** — все аккаунты равны |
| UI аккаунтов | Минимальный: привязка profile ↔ label, статус, без массового импорта |

### 14.4 Прогрев

| Решение | Значение |
|---------|----------|
| Связь с комментингом | **Только вручную** — отдельный режим, не автоматическая цепочка |
| Источник видео | **Поиск по ключевым словам** (не только FYP) |
| Действия | Смотреть, лайк, подписка, сохранение, шеринг (+ расширяемо) |
| Загрузка видео в TT | **Не нужна** |

### 14.5 UI и workflow

| Решение | Значение |
|---------|----------|
| Организация комментинга | **Только пресеты автоматизации** (как YouTube Automation) — без отдельной страницы Campaigns |
| Results | **Минимально:** количество оставленных комментов под каждым видео |
| Task chains | **Позже** — не в первой версии |
| Приоритет | **Всё параллельно** по фазам из §9 |

### 14.6 Корректировки к §2 (UI)

**Цветовая схема TikTok-модуля (dark + gold):**
```css
--color-background: #0a0a0b;
--color-card: #111113;
--color-primary: #d4af37;       /* золотой */
--color-primary-hover: #f5c542;
--color-accent-glow: rgba(212, 175, 55, 0.25);
```

**Platform Dock:** 4 иконки (YT, TT, IG, TG). IG и TG — disabled/«скоро» до реализации.

**Вместо TikTokCampaigns** — расширить `TikTokAutomation.jsx` (аналог `Automation.jsx`):
- Вкладка Warmup
- Вкладка Smart Comment с полями: video URLs, comment pool, strategy sliders, limits
- Сохранение пресетов: `automationPresets` + поле `module: 'tiktok'`

### 14.7 Корректировки к §5 (данные)

Убрать `tiktok.campaigns[]`. Вместо этого — пресеты в существующем `automationPresets`:

```javascript
{
  id, name, module: 'tiktok',
  mode: 'warmup' | 'smart_comment',
  config: { /* все параметры из §3.2 и §4 */ },
  profileIds: []
}
```

Results — упрощённо:
```javascript
tiktok: {
  commentStats: [
    { videoUrl, videoId, commentsPosted, lastRunAt, presetId }
  ]
}
```

---

*Конец мастер-промпта.*
