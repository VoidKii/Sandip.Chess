@echo off
title Sandip.Chess

echo.
echo ================================
echo        Sandip.Chess
echo ================================
echo.

echo Starting backend...
start "Sandip.Chess Backend" cmd /k "cd /d C:\Users\sushi\OneDrive\Desktop\Sandip.Chess\backend && node server.js"

timeout /t 2 /nobreak >nul

echo Starting frontend...
start "Sandip.Chess Frontend" cmd /k "cd /d C:\Users\sushi\OneDrive\Desktop\Sandip.Chess\frontend && npm run dev"

timeout /t 3 /nobreak >nul

echo.
echo Sandip.Chess is starting!
echo Opening website...
start http://localhost:5173/

exit