@echo off
rem Veille Emploi installer for Windows: downloads a release from GitHub,
rem checks its SHA-256, then runs the scripts\install.mjs it contains.
rem   Installer.cmd            latest release
rem   Installer.cmd 1.2.0      that version: roll back, or try a pre-release
rem VEILLE_REPO (owner/name) or VEILLE_BASE_URL override the download source.
chcp 65001 >nul
setlocal EnableExtensions

if not defined VEILLE_REPO set "VEILLE_REPO=benjaminwiseboy/job-scrapper"
set "ASSET=veille-emploi.zip"
set "RC=0"
set "TAG=%~1"
if not defined TAG goto latest
if /i not "%TAG:~0,1%"=="v" set "TAG=v%TAG%"
set "BASE=https://github.com/%VEILLE_REPO%/releases/download/%TAG%"
set "LABEL=la version %TAG%"
goto source
:latest
set "BASE=https://github.com/%VEILLE_REPO%/releases/latest/download"
set "LABEL=la dernière version"
:source
if defined VEILLE_BASE_URL set "BASE=%VEILLE_BASE_URL%"

where curl >nul 2>nul || goto oldwindows
where tar >nul 2>nul || goto oldwindows

set "WORK=%TEMP%\veille-emploi-install-%RANDOM%%RANDOM%"
mkdir "%WORK%" || goto fail

echo Téléchargement de %LABEL% de Veille Emploi...
curl -fL --progress-bar -o "%WORK%\%ASSET%" "%BASE%/%ASSET%" || goto notfound
curl -fsSL -o "%WORK%\%ASSET%.sha256" "%BASE%/%ASSET%.sha256" || goto notfound

rem Paths go through the environment: a quote in the user name would break inline ones.
powershell -NoProfile -Command "$z = Join-Path $env:WORK $env:ASSET; $e = ((Get-Content -LiteralPath ($z + '.sha256') -Raw).Trim() -split '\s+')[0]; if ((Get-FileHash -LiteralPath $z -Algorithm SHA256).Hash -ne $e) { exit 1 }"
if errorlevel 1 goto badsum

tar -xf "%WORK%\%ASSET%" -C "%WORK%" || goto fail
set "APP=%WORK%\veille-emploi"
if not exist "%APP%\scripts\install.mjs" goto fail

where node >nul 2>nul
if not errorlevel 1 goto run

echo Node.js est introuvable : Veille Emploi en a besoin.
echo Je peux installer la version LTS officielle depuis nodejs.org, environ 30 Mo.
choice /C ON /M "Installer Node.js maintenant"
if errorlevel 2 goto manual

powershell -NoProfile -ExecutionPolicy Bypass -File "%APP%\scripts\install-node.ps1"
if errorlevel 1 goto manual

rem The new PATH only reaches new windows: add Node's folder for this one.
set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 goto manual

:run
node "%APP%\scripts\install.mjs"
set "RC=%errorlevel%"
goto done

:manual
echo.
echo Installe Node.js, version LTS, depuis https://nodejs.org puis relance ce fichier.
set "RC=1"
goto done

:notfound
echo.
echo Impossible de télécharger %LABEL% depuis https://github.com/%VEILLE_REPO%/releases
echo Vérifie ta connexion internet, ou le numéro de version demandé.
set "RC=1"
goto done

:badsum
echo.
echo Le fichier téléchargé ne correspond pas à son empreinte SHA-256 : installation annulée.
set "RC=1"
goto done

:oldwindows
echo Il manque curl ou tar, présents dans Windows depuis Windows 10 version 1803.
echo Mets Windows à jour, puis relance ce fichier.
set "RC=1"
goto done

:fail
echo.
echo L'installation a échoué.
set "RC=1"

:done
if defined WORK rmdir /s /q "%WORK%" 2>nul
pause
exit /b %RC%
