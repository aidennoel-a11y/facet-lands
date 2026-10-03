@echo off
rem Facet Lands: updates the game, starts the multiplayer server and the
rem game, and opens it in the browser. Double-click to run (Windows).
rem Needs Node.js (nodejs.org) and Git (git-scm.com).
cd /d "%~dp0"
title Facet Lands

echo Getting the latest version...
git pull origin claude/sharp-cerf-ujjlr6

echo.
echo Installing what the game needs (only slow the first time)...
call npm install --no-audit --no-fund
if errorlevel 1 goto failed
pushd server
call npm install --no-audit --no-fund
if errorlevel 1 goto failed
popd

echo.
echo Building the game...
call npm run build
if errorlevel 1 goto failed

echo.
echo Starting the server and the game (each in its own window: leave them open)...
start "Facet Lands server" /d "%~dp0server" cmd /k npm start
start "Facet Lands game" /d "%~dp0." cmd /k npm run preview -- --port 4173 --strictPort

rem (A moment for them to start, then open the game.)
timeout /t 4 /nobreak >nul
start "" http://localhost:4173

echo.
echo ============================================================
echo  The game is open in your browser: http://localhost:4173
echo.
echo  To play online on this computer, in Play online use the server
echo      ws://localhost:8787
echo.
echo  For friends on other computers, run host-online.bat instead.
echo  To stop: close the "Facet Lands server" and "Facet Lands game" windows.
echo ============================================================
echo.
if /i not "%~1"=="nopause" pause
exit /b 0

:failed
echo.
echo Something went wrong (see above). Check Node.js and Git are installed.
pause
exit /b 1
