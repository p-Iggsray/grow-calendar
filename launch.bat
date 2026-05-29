@echo off
setlocal
cd /d "%~dp0"
title The Grow Calendar - Dev Server

:: Verify Node.js is installed and meets the minimum version requirement
where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not found in PATH.
  echo Download the latest LTS from https://nodejs.org
  pause >nul
  exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node --version') do set "NODE_VER=%%v"
set "NODE_MAJOR=%NODE_VER:~1%"
if %NODE_MAJOR% LSS 18 (
  echo ERROR: Node 18 or higher is required. You are on Node %NODE_MAJOR%.
  echo Download the latest LTS from https://nodejs.org
  pause >nul
  exit /b 1
)

if not exist node_modules (
  echo node_modules not found. Running npm install...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Press any key to close.
    pause >nul
    exit /b 1
  )
)

echo.
echo Ensuring the local database tables exist...
call npx wrangler d1 execute grow-calendar-db --local --file=./schema.sql >nul 2>&1

echo.
echo Starting the Cloudflare Worker (API + local database) in a separate window.
echo Wait for it to print "Ready on http://localhost:8787" before logging in.
start "The Grow Calendar - Worker" cmd /k "npx wrangler dev"

echo Giving the Worker a few seconds to start...
timeout /t 6 /nobreak >nul

echo.
echo Starting the Vite dev server. Your browser should open automatically.
echo The app runs at http://localhost:5173 and talks to the Worker on port 8787.
echo To stop everything: press Ctrl+C here, then close the Worker window.
echo.
call npm run dev

echo.
echo Vite stopped. The Worker window is still open. Close it to fully stop.
echo Press any key to close this window.
pause >nul
endlocal
