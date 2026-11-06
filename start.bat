@echo off
chcp 65001 >nul
title 408 学习助手
cd /d "%~dp0"
echo.
echo  408 学习助手启动中...
echo  本机访问：http://127.0.0.1:8000
echo  手机访问：http://192.168.1.43:8000（需同一 Wi-Fi）
echo.
"C:\ProgramData\anaconda3\envs\py311\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000
echo.
echo 服务已停止。
pause
