#!/usr/bin/env bash
# KITTY PET · 一键启动脚本
set -e

cd "$(dirname "$0")/backend"

if ! command -v uv >/dev/null 2>&1; then
  echo "  [X] 未检测到 uv，请先安装："
  echo "      curl -LsSf https://astral.sh/uv/install.sh | sh"
  exit 1
fi

echo "  [1/2] 安装依赖..."
uv sync

echo ""
echo "  [2/2] 启动服务..."
echo "  打开浏览器访问:  http://127.0.0.1:8000"
echo ""

uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
