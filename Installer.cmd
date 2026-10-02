@echo off
rem Veille Emploi installer for Windows: double-click after unzipping.
chcp 65001 >nul
setlocal

where node >nul 2>nul
if not errorlevel 1 goto run

echo Node.js est introuvable : Veille Emploi en a besoin.
echo Je peux installer la version LTS officielle depuis nodejs.org (environ 30 Mo).
choice /C ON /M "Installer Node.js maintenant"
if errorlevel 2 goto manual

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-node.ps1"
if errorlevel 1 goto manual

rem The new PATH only reaches new windows: add Node's folder for this one.
set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 goto manual

:run
node "%~dp0scripts\install.mjs"
pause
exit /b

:manual
echo.
echo Installe Node.js (version LTS) depuis https://nodejs.org puis relance ce fichier.
pause
exit /b 1
