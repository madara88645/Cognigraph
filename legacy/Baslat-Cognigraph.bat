@echo off
setlocal
title Cognigraph
cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
    echo Python bulunamadi. Python 3.x kurulu oldugundan ve PATH'te oldugundan emin olun.
    echo Alternatif: py -3 ile calistirmayi deneyin.
    pause
    exit /b 1
)

echo Cognigraph baslatiliyor...
echo Tarayicida acin: http://127.0.0.1:8000
echo Durdurmak icin bu pencerede Ctrl+C basin.
echo.

python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
if errorlevel 1 (
    echo.
    echo Sunucu hata ile kapandi.
    pause
)
