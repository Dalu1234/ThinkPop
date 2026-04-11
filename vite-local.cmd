@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\vite\bin\vite.js" (
  echo Dependencies missing. Run:  npm.cmd install
  exit /b 1
)
node node_modules\vite\bin\vite.js
exit /b %ERRORLEVEL%
