' Launches the print bridge with no visible window at all — this is what
' actually makes "no need to open Command Prompt" true. A plain shortcut to
' `node server.js` still flashes/keeps open a black console window; running
' node through this script instead (via wscript.exe, see install-startup.bat)
' is what suppresses that window entirely.
'
' Startup output (the bridge's own console.log lines — IP address, HTTPS
' setup steps, etc.) goes to bridge-log.txt in this same folder instead of
' a window, since there's no window left to show it in. Open that file if
' you ever need to check the computer's current IP address again.
Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")
strFolder = objFSO.GetParentFolderName(WScript.ScriptFullName)
objShell.CurrentDirectory = strFolder
objShell.Run "cmd /c node server.js > bridge-log.txt 2>&1", 0, False
