@echo off
chcp 65001 >nul
title Quick QR - Quet & Tai Ma QR Sieu Toc

echo ===================================================
echo     ⚡ QUICK QR - QUET & TAI MA QR SIEU TOC ⚡
echo ===================================================
echo.

:: Kiem tra xem co Node.js khong
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Phat hien Node.js, dang khoi dong Local Server...
    node local_server.js
    goto end
)

:: Kiem tra xem co Python khong
where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Phat hien Python, dang khoi dong Local Server...
    start "" http://localhost:8088
    python -m http.server 8088
    goto end
)

:: Neu khong co Node hay Python, mo truc tiep index.html
echo [!] Mo truc tiep bang trinh duyet mac dinh...
start "" "index.html"

:end
