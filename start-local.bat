@echo off
chcp 65001 >nul
title Turon TZ
set "NODE_EXE=node"
where node >nul 2>nul
if not errorlevel 1 goto run
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not "%NODE_EXE%"=="node" goto run
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE_EXE=%LocalAppData%\Programs\nodejs\node.exe"
if not "%NODE_EXE%"=="node" goto run
echo Node.js ne nayden. Skachayte s https://nodejs.org i ustanovite, potom zapustite start-local.bat.
start "" https://nodejs.org
pause
goto :eof
:run
start "" http://localhost:3457
"%NODE_EXE%" "%~dp0server.js"
echo.
echo Server ostanovlen. Esli vyshe est oshibka - prochtite ee.
pause
