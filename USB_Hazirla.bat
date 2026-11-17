@echo off
chcp 65001 >nul
title Xbox One USB Flash Bellek OSU1 Kurucu

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo =================================================================
    echo   [!] YONETICI YETKISI GEREKLI: UAC Izin Penceresi Aciliyor...
    echo =================================================================
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/c \"\"%~dpnx0\"\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
echo =================================================================
echo       XBOX ONE USB FLASH BELLEK OSU1 KURULUM ARACI (OTOMATIK)
echo =================================================================
echo.
echo [*] OSU1.zip ve USB Flash Bellek hazirlaniyor...
echo.

set PYTHON_EXE=C:\Users\kabad\AppData\Local\antigravity\python\5a1c45aafcb841ee\python.exe
if not exist "%PYTHON_EXE%" set PYTHON_EXE=python

"%PYTHON_EXE%" scripts\prepare_usb_cli.py

pause
