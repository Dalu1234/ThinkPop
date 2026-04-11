@echo off
set "PATH=%ProgramFiles%\nodejs;%PATH%"
where npm >nul 2>&1 || (
  echo Node.js not found at %ProgramFiles%\nodejs
  echo Install from https://nodejs.org/ or fix your PATH.
  exit /b 1
)
npm run dev:split
