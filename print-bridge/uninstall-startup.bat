@echo off
REM Undoes install-startup.bat — removes the auto-start shortcut so the
REM print bridge no longer starts itself when this computer turns on.
REM Doesn't stop it if it's already running right now — use
REM stop-bridge.bat for that.

set "SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Wanderers Rest Print Bridge.lnk"

if exist "%SHORTCUT%" (
  del "%SHORTCUT%"
  echo Removed. The print bridge will no longer start automatically.
) else (
  echo Nothing to remove — it wasn't set to start automatically.
)
echo.
pause
