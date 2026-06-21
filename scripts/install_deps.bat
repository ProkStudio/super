@echo off
chcp 65001 >nul
title TechPro — установка зависимостей
echo.
echo ========================================
echo   TechPro — Python и Playwright
echo ========================================
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo [ОШИБКА] Python не найден в PATH.
  echo.
  echo 1. Скачай Python 3.10+ с https://www.python.org/downloads/
  echo 2. При установке включи галочку "Add python.exe to PATH"
  echo 3. Перезапусти этот файл
  echo.
  pause
  exit /b 1
)

python --version
echo.

set "REQ=%~dp0requirements.txt"
if not exist "%REQ%" (
  echo [ОШИБКА] Не найден %REQ%
  pause
  exit /b 1
)

echo Устанавливаю pip-пакеты...
python -m pip install --upgrade pip
python -m pip install -r "%REQ%"
if errorlevel 1 (
  echo [ОШИБКА] pip install не удался
  pause
  exit /b 1
)

echo.
echo Готово! Playwright подключается к MostLogin по CDP — Chromium не нужен.
echo.
pause
