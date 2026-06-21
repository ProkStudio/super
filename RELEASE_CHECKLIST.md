# TechPro — чеклист релиза и обновления

Документ для агента и разработчика. Репозиторий: https://github.com/ProkStudio/super

---

## Почему на GitHub пусто?

Автообновление в приложении **только смотрит** на GitHub Releases. Само ничего не заливает.

Пока не сделано вручную:

1. **Нет Release** с `TechPro-Setup-X.X.X.exe` + `latest.yml` → приложение не найдёт обновление.
2. **Нет push кода** (локальная папка может быть без `git`) → репозиторий пустой.

`npm run build:win` кладёт файлы только в локальную папку `release/`.  
`npm run build:publish` заливает на GitHub, но нужны: **git-репозиторий**, **`GH_TOKEN`**, установленный **`gh`** или токен для electron-builder.

---

## Быстрый старт — первый Release (5 минут, без gh CLI)

1. Открой: https://github.com/ProkStudio/super/releases/new  
2. **Choose a tag:** `v2.0.4` → Create new tag on publish  
3. **Release title:** `TechPro 2.0.4`  
4. Прикрепи **два файла** из `release/`:
   - `TechPro-Setup-2.0.4.exe` — **имя важно!** (не «TechPro Setup…» с пробелами)
   - `latest.yml`
5. **Publish release**

> Если есть только `TechPro Setup 2.0.4.exe` — переименуй или скопируй в `TechPro-Setup-2.0.4.exe`.  
> В `latest.yml` указано именно это имя — иначе автообновление не скачает файл.

После этого у друга с Setup: **Кабинет → Проверить обновления** (или модалка при старте).

---

## Залить исходный код на GitHub (один раз)

В папке проекта (PowerShell):

```powershell
cd c:\Users\HONOR\Desktop\traffic\Super
git init
git remote add origin https://github.com/ProkStudio/super.git
git add .
git commit -m "Initial commit: TechPro 2.0.4"
git branch -M main
git push -u origin main
```

Нужен логин GitHub (браузер или Personal Access Token).  
Большие папки (`node_modules`, `release/`, `resources/python/`) в `.gitignore` — в репо только исходники.

---

## Автопубликация релиза (следующие версии)

```powershell
# Установить GitHub CLI: winget install GitHub.cli
gh auth login

$env:GH_TOKEN = "ghp_..."   # или gh auth token
npm run build:publish
```

Поднимает `version` в `package.json` **до** сборки. Создаст Release и загрузит exe + `latest.yml`.

---

## Коротко: нужно ли снова скидывать установщик другу?

| Ситуация | Что делать другу |
|----------|------------------|
| Уже стоит **Setup** (не portable), версия **≥ 2.0.5** с автообновлением | **Ничего.** При запуске — модалка «Доступно обновление» или автоскачивание. Перезапуск → готово. Данные сохраняются. |
| Первый раз / переустановка | Скинуть **`TechPro Setup X.X.X.exe`** из `release/` |
| Стоит **portable** (`TechPro X.X.X.exe`) | Автообновление **не работает**. Либо новый portable, либо один раз поставить **Setup** — дальше обновления из приложения. |
| Автообновление выключено | **Кабинет → «Проверить обновления»** или снова Setup поверх (данные не удаляются) |

Данные пользователя: `%APPDATA%\TechPro\` (`nexus-toolkit.json` и пресеты). Установщик их **не трогает** (`deleteAppDataOnUninstall: false`).

---

## Чеклист разработчика — выпустить обновление

### 1. Подготовка

- [ ] Закоммитить и запушить изменения в `main` (или релизную ветку)
- [ ] Поднять **`version`** в `package.json` (semver, напр. `2.0.4` → `2.0.5`)
- [ ] Кратко описать изменения (для Release notes на GitHub)

### 2. Сборка (локально)

```powershell
cd c:\Users\HONOR\Desktop\traffic\Super
npm install
npm run build:win
```

Артефакты в `release/`:

- `TechPro Setup {version}.exe` — **основной**, для друга и для electron-updater
- `TechPro {version}.exe` — portable (без автообновления)
- `latest.yml` — нужен для автообновления (генерируется electron-builder)

Первая сборка / после очистки `resources/python`: `bundle_python.ps1` качает Python + Chromium (~800 MB), долго.

### 3. Публикация на GitHub (чтобы друзья получили update in-app)

**Вариант A — автоматически:**

```powershell
$env:GH_TOKEN = "ghp_..."   # classic token, scope: repo
npm run build:publish
```

Создаст/обновит Release с тегом `v{version}`, загрузит exe + `latest.yml`.

**Вариант B — вручную:**

1. GitHub → **ProkStudio/super** → Releases → **Draft a new release**
2. Tag: `v2.0.5` (совпадает с `package.json`)
3. Прикрепить из `release/`:
   - `TechPro Setup 2.0.5.exe` (**обязательно**)
   - `latest.yml` (**обязательно** для автообновления)
4. Publish release

Без `latest.yml` на Release приложение не найдёт обновление.

### 4. Проверка после релиза

- [ ] Release **public** (или настроен доступ для private + token — по умолчанию public)
- [ ] В Release есть Setup exe и `latest.yml`
- [ ] Версия в `latest.yml` **выше**, чем у установленного у друга
- [ ] На тестовой машине: установленный Setup → через 5 сек или **Кабинет → Проверить обновления** → модалка

### 5. Что сказать другу (если спрашивает)

> Обнови через программу: **Кабинет → Проверить обновления**, или дождись уведомления при запуске.  
> Если автообновление включено — скачает сам, нажми **Перезапустить**.  
> Настройки и аккаунты не пропадут.  
> Если portable — один раз поставь **Setup**, дальше обновления из приложения.

Первый раз после добавления updater: **один раз** скинуть новый Setup (версия с модулем обновлений). Дальше — только GitHub Release.

---

## Чеклист друга — получить обновление

- [ ] Закрыть TechPro
- [ ] **Либо** дождаться модалки при следующем запуске  
- [ ] **Либо** Кабинет → **Проверить обновления**
- [ ] **Скачать и установить** → дождаться 100% → **Перезапустить**
- [ ] (Опционально) включить **Автообновление** в модалке или Кабинете
- [ ] Если не сработало: скачать `TechPro Setup X.X.X.exe` с GitHub Releases и запустить поверх старой установки

---

## Ограничения

- Автообновление: только **NSIS Setup**, не portable
- **Dev** (`npm run dev`): обновления отключены
- Антивирус может спросить при установке — добавить в исключения
- Private repo: для `build:publish` нужен `GH_TOKEN`; скачивание у клиентов — только public Release или доработка

---

## Команды (шпаргалка)

| Команда | Назначение |
|---------|------------|
| `npm run build:win` | Сборка Setup + portable в `release/` |
| `npm run build:publish` | Сборка + upload на GitHub Releases |
| `npm run build:frontend` | Только UI (без exe) |
| `npm run bundle:python` | Только Python/Chromium в `resources/` |

---

## Файлы кода обновлений

- `electron/services/appUpdater.js` — логика electron-updater
- `src/components/layout/UpdateModal.jsx` — модалка
- `src/components/pages/Cabinet.jsx` — ручная проверка + toggle
- `package.json` → `build.publish` → `ProkStudio/super`
