@echo off
chcp 65001 >nul
title Xbox One Dahili Disk ^& SSD Yoneticisi

:: Yonetici (Administrator) yetkisi kontrolu
net session >nul 2>&1
if %errorLevel% == 0 (
    goto :run_app
) else (
    echo =================================================================
    echo   [!] YONETICI YETKISI GEREKLI: UAC Izin Penceresi Aciliyor...
    echo =================================================================
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/c \"\"%~dpnx0\"\"' -Verb RunAs"
    exit /b
)

:run_app
cd /d "%~dp0"
echo =================================================================
echo        XBOX ONE DAHILI DISK VE SSD HAZIRLAMA ARACI (GUI)
echo =================================================================
echo.
echo [*] Electron Arayuzu Baslatiliyor... Lutfen bekleyin...
echo.

npm start

if %errorLevel% neq 0 (
    echo.
    echo [!] Bir hata olustu. Node.js ve bagimliliklar kontrol ediliyor...
    pause
)
