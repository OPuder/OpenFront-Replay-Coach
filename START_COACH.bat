@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title OpenFront Replay Coach

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden.
  echo Bitte Node.js LTS installieren und diesen Starter erneut ausfuehren.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm wurde nicht gefunden.
  pause
  exit /b 1
)

echo.
echo Pruefe Abhaengigkeiten und Electron-Installation ...

if not exist "node_modules\.package-lock.json" (
  echo [1/3] Abhaengigkeiten werden installiert ...
  call npm install
  if errorlevel 1 goto install_failed
) else (
  echo [1/3] Abhaengigkeiten sind bereits vorhanden.
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo [2/3] Electron-Laufzeit wird repariert ...
  call npm install-scripts approve electron esbuild
  if errorlevel 1 (
    echo npm konnte die Installationsskripte nicht freigeben.
    echo Pruefe bitte, ob npm 12 oder neuer verwendet wird.
    goto install_failed
  )
  call npm rebuild electron esbuild
  if errorlevel 1 goto install_failed
) else (
  echo [2/3] Electron-Laufzeit ist vorhanden.
)

echo [3/3] Starte Replay Coach ...
echo.
call npm run dev
if errorlevel 1 (
  echo.
  echo Der Start wurde mit einem Fehler beendet.
  pause
)
goto end

:install_failed
echo.
echo Installation oder Reparatur fehlgeschlagen.
echo Bitte sende die vollstaendige Ausgabe an den Support.
pause
exit /b 1

:end
endlocal
