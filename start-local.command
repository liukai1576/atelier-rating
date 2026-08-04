#!/bin/zsh

set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js。请先安装 Node.js 20.9 或更高版本。"
  read -r "?按回车键退出…"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "首次运行，正在安装依赖…"
  npm install
fi

if ! command -v lark-cli >/dev/null 2>&1; then
  echo "提示：未找到 lark-cli，将使用本地演示数据。"
  echo "需要连接多维表格时运行：npm install -g @larksuite/cli"
fi

echo "评分台将在 http://localhost:3210 启动"
echo "停止服务请按 Control + C"
npm run dev
