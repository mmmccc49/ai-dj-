@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%AI-DJ-Complete-Uninstall-Windows.ps1"

endlocal
