@echo off
setlocal
title 408 Study Assistant
cd /d "%~dp0"

set "PY=C:\ProgramData\anaconda3\envs\py311\python.exe"
set "PORT=8000"
if defined ASSISTANT_PORT set "PORT=%ASSISTANT_PORT%"

rem Detect the LAN IPv4 address (adapter with a default gateway), fallback to 127.0.0.1
set "LANIP_FILE=%TEMP%\assistant_lanip.txt"
powershell -NoProfile -Command "$n=Get-NetIPConfiguration -ErrorAction SilentlyContinue; $ip=''; foreach($c in $n){ if($c.IPv4DefaultGateway -ne $null -and $c.NetAdapter.Status -eq 'Up'){ $ip=$c.IPv4Address.IPAddress; break } }; [IO.File]::WriteAllText('%LANIP_FILE%', $ip, [Text.Encoding]::ASCII)" >nul 2>&1
set "LANIP="
if exist "%LANIP_FILE%" set /p LANIP=<"%LANIP_FILE%"
if exist "%LANIP_FILE%" del "%LANIP_FILE%" >nul 2>&1
if not defined LANIP set "LANIP=127.0.0.1"

if not exist "%PY%" (
    echo [ERROR] Python interpreter not found:
    echo   %PY%
    echo Please check the conda py311 environment path.
    goto :end
)

if not exist "app\main.py" (
    echo [ERROR] app\main.py not found.
    echo Please run this script from the project root folder.
    goto :end
)

netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
    echo [ERROR] Port %PORT% is already in use.
    echo.
    echo Close the program using this port, or start on another port:
    echo   set ASSISTANT_PORT=8001
    echo   start.bat
    echo.
    echo To find the process: netstat -ano ^| findstr :%PORT%
    goto :end
)

echo Starting 408 Study Assistant...
echo   Local: http://127.0.0.1:%PORT%
if "%LANIP%"=="127.0.0.1" (
    echo   Phone: LAN IP not detected, local only: http://127.0.0.1:%PORT%
) else (
    echo   Phone: http://%LANIP%:%PORT%  same Wi-Fi network
)
echo Press Ctrl+C to stop.
echo.

"%PY%" -m uvicorn app.main:app --host 0.0.0.0 --port %PORT%

echo.
echo Server stopped.
goto :end

:end
pause
