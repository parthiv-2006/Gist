@echo off
setlocal

REM ─── Gist Dev Launcher ────────────────────────────────────────────────────
REM Opens two terminal windows:
REM   1. FastAPI backend on http://localhost:8000  (hot-reload)
REM   2. Vite extension build in watch mode        (auto-rebuilds dist/)
REM
REM Usage: double-click dev.bat  OR  run it from any terminal
REM ──────────────────────────────────────────────────────────────────────────

set ROOT=%~dp0

echo.
echo  Starting Gist dev environment...
echo.

REM ── Backend (FastAPI + uvicorn --reload) ──────────────────────────────────
start "Gist Backend" cmd /k "^
  cd /d "%ROOT%gist-backend" ^&^& ^
  call venv\Scripts\activate ^&^& ^
  echo. ^&^& ^
  echo  [Backend] http://localhost:8000 ^&^& ^
  echo. ^&^& ^
  uvicorn app.main:app --reload --port 8000"

REM ── Extension (Vite watch — rebuilds dist/ on every save) ─────────────────
start "Gist Extension (watch)" cmd /k "^
  cd /d "%ROOT%gist-extension" ^&^& ^
  echo. ^&^& ^
  echo  [Extension] Watching for changes... reload in chrome://extensions after first build ^&^& ^
  echo. ^&^& ^
  npm run dev"

echo  Backend window:   Gist Backend
echo  Extension window: Gist Extension (watch)
echo.
echo  Once the extension window shows "built in Xms", reload the extension
echo  in chrome://extensions to pick up the latest dist/.
echo.
echo  This window can be closed.
timeout /t 5 >nul
