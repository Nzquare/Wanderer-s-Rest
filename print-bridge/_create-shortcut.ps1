# Helper for install-startup.bat — creates the Windows Startup shortcut
# that launches start-hidden.vbs (silently) at every login. Not meant to
# be run directly; install-startup.bat calls this with -ExecutionPolicy
# Bypass so it works even on a machine that otherwise blocks scripts.

$scriptDir = $PSScriptRoot
$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "Wanderers Rest Print Bridge.lnk"

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "`"$scriptDir\start-hidden.vbs`""
$shortcut.WorkingDirectory = $scriptDir
$shortcut.Description = "Wanderers Rest print bridge (starts silently)"
$shortcut.Save()

Write-Host "Shortcut created at: $shortcutPath"
