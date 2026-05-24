@echo off
setlocal
cd /d "%~dp0"
title The Grow Calendar - Dev Server

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
echo Starting Vite dev server. Your browser should open automatically.
echo Stop the server with Ctrl+C.
echo.
call npm run dev

echo.
echo Dev server stopped. Press any key to close.
pause >nul
endlocal
