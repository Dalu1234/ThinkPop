@echo off
title ThinkPop AI Teacher — Launcher
color 0B

echo.
echo  =========================================
echo   ThinkPop AI Teacher — Starting servers
echo  =========================================
echo.

echo  [1/2]  MDM Python backend  (port 8000) ...
start "MDM Backend" cmd /k "title MDM Backend ^& color 0A ^& cd /d C:\Users\chukw\Desktop\Programming\brainpop ^& venv\Scripts\python backend\main.py"

echo  Waiting for MDM to initialise (5s)...
timeout /t 5 /nobreak > nul

echo  [2/2]  ThinkPop  (Vite :5173 + API :8787) ...
echo.
echo  Open  http://127.0.0.1:5173  in your browser.
echo  Click  Get Started  then  Ask me anything  to test.
echo.
npm run dev:split
