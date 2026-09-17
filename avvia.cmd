@echo off
setlocal
title CLAUDIO - analisi dati e Lean Six Sigma
cd /d "%~dp0"

set PORT=8777

echo Avvio del server locale sulla porta %PORT% ...

where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:%PORT%/index.html
  python -m http.server %PORT%
  goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:%PORT%/index.html
  py -m http.server %PORT%
  goto :eof
)

where npx >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:%PORT%
  npx --yes serve -l %PORT% .
  goto :eof
)

echo.
echo Non ho trovato ne Python ne Node sul computer.
echo Apri comunque index.html con un doppio clic: su alcuni browser funziona.
echo.
start "" index.html
pause
