@echo off
setlocal
cd /d "%~dp0"

set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
if exist "%NPM_CMD%" goto run

where npm.cmd >nul 2>&1
if %ERRORLEVEL% equ 0 (
  set "NPM_CMD=npm.cmd"
  goto run
)

echo Node.js was not found. Install LTS from https://nodejs.org/
exit /b 1

:run
"%NPM_CMD%" run dev:split
exit /b %ERRORLEVEL%
