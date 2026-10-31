@echo off
REM Stops a currently-running print bridge — needed because the silent
REM auto-start (install-startup.bat) has no window to close anymore.
REM Doesn't undo the auto-start itself, so it'll start again next time
REM this computer is turned on — use uninstall-startup.bat for that.

echo Stopping the print bridge...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"

echo Done.
echo.
pause
