@echo off
rem Facet Lands, hosting for friends anywhere: everything play.bat does,
rem and a Cloudflare tunnel giving the server a public address.
rem Needs cloudflared: winget install --id Cloudflare.cloudflared
cd /d "%~dp0"
title Facet Lands (online)

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo cloudflared isn't installed. Installing it...
  winget install --id Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements
  echo.
  echo If it installed, close this window and double-click host-online.bat again.
  pause
  exit /b 1
)

call "%~dp0play.bat" nopause
start "Facet Lands tunnel" cmd /k "cloudflared tunnel --url http://localhost:8787"

echo.
echo ============================================================
echo  In the "Facet Lands tunnel" window, find the address ending in
echo  trycloudflare.com (it takes a few seconds), for example:
echo      https://some-words-here.trycloudflare.com
echo.
echo  Everyone (you too) uses it in Play online with wss:// in front:
echo      wss://some-words-here.trycloudflare.com
echo.
echo  Host a new world, then send your friends that address and the
echo  six-letter world code. It changes each time you run this.
echo ============================================================
echo.
pause
