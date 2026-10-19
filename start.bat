@echo off
chcp 65001 >nul
title KITTY PET - AI Chatbot

echo.
echo   ============================================
echo    KITTY PET  ·  Hello Kitty Pixel Chatbot
echo   ============================================
echo.

cd /d "%~dp0backend"

where uv >nul 2>nul
if errorlevel 1 (
  echo   [X] 未检测到 uv，请先安装：
  echo       powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
  pause
  exit /b 1
)

echo   [1/2] 安装依赖...
uv sync

echo.
echo   [2/2] 启动服务...
echo   打开浏览器访问:  http://127.0.0.1:8000
echo.

uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

pause
