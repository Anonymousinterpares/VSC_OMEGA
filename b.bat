@echo off
setlocal enabledelayedexpansion

:: Check for node_modules
if not exist node_modules (
    echo [INFO] node_modules not found, installing dependencies...
    call npm install
)

:: Find first free port starting from 5173
echo [INFO] Searching for an available port...
for /f "usebackq" %%p in (`powershell -NoProfile -Command "$port = 5173; while ((Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue) -or (Get-NetUDPEndpoint -LocalPort $port -ErrorAction SilentlyContinue)) { $port++ }; $port"`) do (
    set VITE_PORT=%%p
)

echo [INFO] Using port: %VITE_PORT%
set VITE_PORT=%VITE_PORT%

echo [INFO] Starting VSC OMEGA...
call npm run dev