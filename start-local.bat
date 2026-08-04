@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 20.9 or newer first.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies for the first run...
  call npm install
)

where lark-cli >nul 2>nul
if errorlevel 1 (
  echo lark-cli was not found. The score desk will use local demo data.
  echo Install it with: npm install -g @larksuite/cli
)

echo Starting the score desk at http://localhost:3210
call npm run dev
