@echo off
setlocal
title CogniGraph
cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
    echo Python was not found. Install Python 3.x and ensure it is on PATH.
    echo You can also try: py -3 -m uvicorn ...
    pause
    exit /b 1
)

echo Starting CogniGraph...
echo Open in browser: http://127.0.0.1:8000
echo Press Ctrl+C in this window to stop the server.
echo.

python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
if errorlevel 1 (
    echo.
    echo Server exited with an error.
    pause
)
