@echo off
setlocal

REM ─── Gist Dev Launcher ────────────────────────────────────────────────────
REM Opens two PowerShell windows:
REM   1. FastAPI backend on http://localhost:8000  (hot-reload)
REM   2. Vite extension build in watch mode        (auto-rebuilds dist/)
REM
REM Usage: double-click dev.bat  OR  run it from any terminal
REM ──────────────────────────────────────────────────────────────────────────

set "BACKEND=%~dp0gist-backend"
set "EXTENSION=%~dp0gist-extension"

echo.
echo  Starting Gist dev environment...
echo.

REM ── Backend: use venv python directly — no activation needed, handles spaces ─
start "Gist Backend" powershell.exe -NoExit -ExecutionPolicy Bypass -Command ^
  "Set-Location '%BACKEND%'; Write-Host ' [Backend] Starting on http://localhost:8000' -ForegroundColor Cyan; & '.\venv\Scripts\python.exe' -m uvicorn app.main:app --reload --port 8000"

REM ── Extension: Vite watch mode ──────────────────────────────────────────────
start "Gist Extension (watch)" powershell.exe -NoExit -ExecutionPolicy Bypass -Command ^
  "Set-Location '%EXTENSION%'; Write-Host ' [Extension] Watch mode — dist/ rebuilds on every save' -ForegroundColor Green; npm run dev"

echo  Backend window:   Gist Backend
echo  Extension window: Gist Extension (watch)
echo.
echo  Once the extension window shows "built in Xms", reload the
echo  extension in chrome://extensions to pick up the latest dist/.
echo.
echo  This window can be closed.
timeout /t 4 >nul
