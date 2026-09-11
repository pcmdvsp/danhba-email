@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; $record=Get-Content -LiteralPath '.runtime/process.json' -Raw | ConvertFrom-Json; $appProcess=Get-Process -Id $record.pid -ErrorAction SilentlyContinue; if(-not $appProcess){Write-Output 'App da dung.'; exit}; $expectedNode=(Get-Command node.exe).Source; $recordedAt=[DateTimeOffset]::Parse($record.started).UtcDateTime; if(($appProcess.Path -ne $expectedNode) -or ([Math]::Abs(($appProcess.StartTime.ToUniversalTime()-$recordedAt).TotalSeconds) -gt 5)){throw 'Khong xac minh duoc tien trinh. Khong dung de tranh anh huong ung dung khac.'}; Stop-Process -Id $record.pid; Write-Output 'Da dung app danh ba.'"
echo.
pause
