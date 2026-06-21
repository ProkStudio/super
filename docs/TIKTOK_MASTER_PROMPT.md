# TikTok Smart Comment — Master Prompt (для AI-агента)

## Контекст проекта

**TechPro / Super** — Electron + React UI + Python Playwright через CDP (MostLogin и др.).

Модуль TikTok: `scripts/tiktok/`, UI: `src/components/pages/tiktok/`, runner: `electron/services/tiktokRunner.js`.

## Цель модуля

Автоматические ответы (Reply) на комментарии под целевыми видео TikTok с антидетект-профилей, минуя WAF/captcha где возможно.

## Критические ограничения (не ломать)

1. **Не делать `page.goto(video_url)`** на URL видео — только UI TikTok: профиль `@user` → сетка → клик по `video_id`.
2. **Короткие ссылки** (`vm.tiktok.com`, `vt.tiktok.com`, `tiktok.com/t/`) — разворачивать через HTTP HEAD/GET **до** браузера (`navigation.resolve_tiktok_url`, `tiktokRunner.normalizeVideoUrlList`).
3. **Вход на TikTok** — через поиск «tiktok» (Bing/DDG/…), не через Google `site:tiktok.com/video/…`.
4. **WAF** — `page_health.is_waf_confirmed`; не фейлить преждевременно во время загрузки плеера.

## Текущая логика комментинга (2026)

### Поток `_process_video` (`smart_comment.py`)

1. `open_tiktok_video` → `open_video_from_profile` (fallback: search videos).
2. Открыть панель комментариев, дождаться DOM.
3. **`iterate_comments_top_down`** — листать сверху вниз до конца:
   - на каждый новый комментарий проверить фильтры;
   - если подходит → `post_reply` + пауза 7–11 сек (настраивается);
   - стоп при `commentsPerVideo` (1–100) или когда новых комментов нет.
4. Опционально: корневой коммент, лайк родителя, лайк/подписка на видео.

### Фильтры (`comment_parser._base_filter`)

- `commentDateFilterEnabled` + `commentMaxAgeDays` — **строгий**: `ageHours is None` → пропуск.
- `skipPinned`, `skipOwn` (по @username профиля).
- Дедуп: `repliedKeys` = `videoId|parentId|profileId`.

### Удалено (не восстанавливать без запроса)

- Фазы A/B (топ N + снизу вверх).
- `scrollDepth` — прокрутка только автоматическая в `iterate_comments_top_down`.
- Предварительный полный scrape + `build_comment_targets`.

## Ключевые файлы

| Файл | Роль |
|------|------|
| `navigation.py` | URL parse, short link resolve, open video |
| `search_nav.py` | Profile grid, search fallback |
| `comment_parser.py` | DOM scrape, date parse, `iterate_comments_top_down` |
| `comment_poster.py` | Reply click by author+text, like parent |
| `smart_comment.py` | Orchestrator |
| `TikTokAutomation.jsx` | UI, presets, лимиты |
| `tiktokRunner.js` | Electron batch, URL normalize |
| `ru.json` → `guide.topics.tiktokAutomation` | Шпаргалка в UI |

## UI / i18n

- Шпаргалка: `GuideDrawer` + `getGuideTopicId(page, activeModule)`.
- Подсказки полей: `FieldHint` + `tiktok.automation.comment.*Hint`.
- Лимит комментов: slider 1–100, default 20.

## Тестовые URL

- Полный: `https://www.tiktok.com/@sheikhh787/video/7442786134649834808`
- Короткий: `https://vm.tiktok.com/ZNR3U4oSc/`

## При доработках проверять

```bash
python -m py_compile scripts/tiktok/comment_parser.py scripts/tiktok/smart_comment.py scripts/tiktok/navigation.py
```

Логи должны содержать: `листаю комментарии сверху вниз`, `просмотрено X, подошло Y, отсеяно Z, ответов N/limit`.

## Запросы пользователя (история)

- Обход WAF без Google site: search.
- Reply на комментарии, не просто scroll.
- Паузы 7–11 сек.
- Лайк родителя после reply.
- Короткие vm-ссылки без captcha.
- Одна логика: листай вниз → фильтр → ответ → до лимита или конца.
- Гайд в UI (шпаргалка + tooltips).
