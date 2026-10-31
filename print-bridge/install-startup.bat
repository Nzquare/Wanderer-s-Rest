@echo off
REM One-time setup: makes the print bridge start automatically, silently,
REM every time this computer is turned on and signed into — no Command
REM Prompt window to open or leave running. Double-click this file once.
REM Safe to double-click again later too (it just replaces the shortcut).

set "SCRIPT_DIR=%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%_create-shortcut.ps1"
if errorlevel 1 (
  echo.
  echo Something went wrong creating the startup shortcut. Nothing was started.
  pause
  exit /b 1
)

echo.
echo Done. From now on, every time this computer is turned on and you sign
echo in, the print bridge will start automatically in the background — no
echo window, nothing to click.
echo.
echo Starting it right now too, so you don't have to restart to test it...
wscript.exe "%SCRIPT_DIR%start-hidden.vbs"
timeout /t 2 >nul
echo.
echo It should be running now. To check: open a browser on THIS computer
echo and go to http://127.0.0.1:9123/health — it should show {"ok":true}.
echo.
echo (To undo this later, run uninstall-startup.bat in this same folder.)
echo.
pause
