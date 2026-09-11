@echo off
chcp 65001 >nul
echo Can chay file nay bang quyen Administrator.
echo Chi mo TCP 8000 cho mang Domain, nguon 172.20.40.0/24, chuong trinh Node.js.
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; if (-not (Get-NetFirewallRule -DisplayName 'Danhba Email - LAN 8000' -ErrorAction SilentlyContinue)) { New-NetFirewallRule -DisplayName 'Danhba Email - LAN 8000' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8000 -RemoteAddress '172.20.40.0/24' -Profile Domain -Program 'C:\Program Files\nodejs\node.exe' | Out-Null }; Get-NetFirewallRule -DisplayName 'Danhba Email - LAN 8000' | Format-Table DisplayName,Enabled,Direction,Action,Profile"
echo.
pause
