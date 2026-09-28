@echo off
title Servidor Local - RSVP
cd /d "%~dp0"

echo ========================================
echo   Iniciando Servidor Next.js (Local)...
echo ========================================
echo.

call npm.cmd run dev

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Ocorreu um problema ao iniciar o servidor.
    pause
)

cmd /k