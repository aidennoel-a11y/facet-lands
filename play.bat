@echo off
rem Facet Lands: updates the game, builds it, starts it, and opens it in
rem the browser. Double-click to run (Windows). Online play uses the game's
rem own server (online, always there): nothing to set up.
rem Needs Node.js (nodejs.org) and Git (git-scm.com).
cd /d "%~dp0"
title Facet Lands

echo Getting the latest version...
git pull origin claude/sharp-cerf-ujjlr6
if errorlevel 1 (
  echo.
  echo !! Couldn't update ^(see above^): playing the version you have.
  echo !! Online, the others may be on a newer one: then little is shared.
  echo.
)

echo.
echo Installing what the game needs (only slow the first time)...
call npm install --no-audit --no-fund
if errorlevel 1 goto failed

echo.
echo Building the game...
call npm run build
if errorlevel 1 goto failed

echo.
echo Starting the game (in its own window: leave it open)...
start "Facet Lands game" /d "%~dp0." cmd /k npm run preview -- --port 4173 --strictPort

rem (A moment for them to start, then open the game: in Chrome, if it's
rem here, as a window of its own, no tabs or address bar, like a game;
rem else in the usual browser.)
timeout /t 4 /nobreak >nul
set CHROME=
reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" >nul 2>&1 && set CHROME=1
reg query "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" >nul 2>&1 && set CHROME=1
if defined CHROME (
  start "" chrome --app=http://localhost:4173 --start-maximized
) else (
  echo ^(Chrome isn't installed: opening in your usual browser. Chrome runs the game more smoothly: google.com/chrome^)
  start "" http://localhost:4173
)

echo.
echo ============================================================
echo  The game is open in Chrome: http://localhost:4173
echo.
echo  Play online: host a world, or click one in the list to join.
echo  Nothing else to set up: the game's server is online for everyone.
echo  To stop: close the "Facet Lands game" window.
echo ============================================================
echo.
if /i not "%~1"=="nopause" pause
exit /b 0

:failed
echo.
echo Something went wrong (see above). Check Node.js and Git are installed.
pause
exit /b 1
