@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title RETURN TO EARTH - Local Launcher
color 0B
echo.
echo  ============================================================
echo   RETURN TO EARTH  -  one-click local launcher
echo  ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [ERROR] Node.js was not found.
  echo  Install Node.js 18 or newer from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo  First run: installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo  [ERROR] npm install failed. Check your network connection and try again.
    pause
    exit /b 1
  )
  echo.
)

echo  Building the production preview...
call npm run build
if errorlevel 1 (
  echo.
  echo  [ERROR] Build failed. See the messages above.
  pause
  exit /b 1
)
echo.
echo  Starting the local server at http://localhost:5173/
echo  The browser will open automatically in a few seconds.
echo.
echo  Keep this window open while using the page.
echo  Press Ctrl+C or close this window to stop the server.
echo.

start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:5173/'"
call npm run preview -- --port 5173 --strictPort
set EXITCODE=%ERRORLEVEL%

echo.
if not "%EXITCODE%"=="0" (
  echo  The dev server stopped with an error ^(exit code %EXITCODE%^).
  echo  If port 5173 is already in use, close the other server window and try again.
)
echo.
pause
