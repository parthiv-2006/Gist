---
name: project-bootstrap
description: >
  Exact shell commands and starter file templates to scaffold both the
  gist-extension (TypeScript + React + Vite) and gist-backend (FastAPI + Python)
  sub-projects from scratch. Run these commands in the repo root before starting
  Phase 1 or Phase 2. Do NOT deviate from these commands — they produce the exact
  directory layout expected by all other skill files.
---

## Overview

This skill covers the one-time setup of both sub-projects. It is run ONCE at the
start of the project. After scaffolding, switch to the phase-specific skills.

---

## 1. Extension Scaffold (`gist-extension/`)

Run from the repo root (`c:\Users\Parthiv Paul\Documents\Gist\`):

```bash
# Create the extension project with React + TypeScript template
npm create vite@latest gist-extension -- --template react-ts

cd gist-extension

# Install core dependencies
npm install

# Install testing dependencies
npm install --save-dev vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event

# Install type definitions for the Chrome Extension API
npm install --save-dev @types/chrome
```

### `vite.config.ts` (replace the generated one entirely)

```typescript
// gist-extension/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        content: resolve(__dirname, "src/content/index.ts"),
        background: resolve(__dirname, "src/background/index.ts"),
        popup: resolve(__dirname, "src/popup/index.html"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
```

### `tsconfig.json` (replace the generated one)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "tests"]
}
```

### `package.json` scripts section (merge into the generated file)

```json
{
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage"
  }
}
```

### `manifest.json` (create at `gist-extension/manifest.json`)

```json
{
  "manifest_version": 3,
  "name": "Gist",
  "version": "0.1.0",
  "description": "Highlight any text and get an instant plain-language explanation.",
  "permissions": ["contextMenus", "scripting", "activeTab", "storage"],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup/index.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "commands": {
    "trigger-gist": {
      "suggested_key": {
        "default": "Ctrl+Shift+E",
        "mac": "Command+Shift+E"
      },
      "description": "Gist the current selection"
    }
  }
}
```

### Directory structure to create manually

```bash
# From gist-extension/
mkdir -p src/background src/content/components src/popup src/utils tests/unit tests/integration icons
```

Create placeholder entry files so Vite doesn't error on first build:

```bash
# src/background/index.ts
echo "// Background Service Worker" > src/background/index.ts

# src/content/index.ts
echo "// Content Script" > src/content/index.ts

# src/utils/text.ts
echo "// Text utilities" > src/utils/text.ts

# src/utils/messages.ts
echo "// Message schema" > src/utils/messages.ts
```

---

## 2. Backend Scaffold (`gist-backend/`)

Run from the repo root:

```bash
mkdir gist-backend
cd gist-backend

# Create the virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Create the directory structure
mkdir -p app/routes app/services app/models tests
```

### `requirements.txt`

```
fastapi>=0.110.0
uvicorn[standard]>=0.27.0
pydantic>=2.0.0
httpx>=0.26.0
google-generativeai>=0.4.0
python-dotenv>=1.0.0
```

### `requirements-dev.txt`

```
pytest>=8.0.0
pytest-asyncio>=0.23.0
pytest-httpx>=0.28.0
anyio[asyncio]>=4.0.0
httpx>=0.26.0
```

```bash
pip install -r requirements.txt -r requirements-dev.txt
```

### `pyproject.toml`

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

### `.env.example`

```
GEMINI_API_KEY=your_gemini_api_key_here
ALLOWED_ORIGINS=*
```

### `app/__init__.py` and sub-package `__init__.py` files

```bash
# Create all __init__.py files
touch app/__init__.py app/routes/__init__.py app/services/__init__.py app/models/__init__.py tests/__init__.py
```

On Windows (PowerShell):
```powershell
"" | Out-File app/__init__.py
"" | Out-File app/routes/__init__.py
"" | Out-File app/services/__init__.py
"" | Out-File app/models/__init__.py
"" | Out-File tests/__init__.py
```

---

## 3. Verification After Scaffolding

### Extension

```bash
cd gist-extension
npm run build
# Expected: dist/ directory created with content.js, background.js, popup/
```

### Backend

```bash
cd gist-backend
# With venv activated:
uvicorn app.main:app --port 8000
# Expected: Uvicorn running on http://0.0.0.0:8000
# (will fail until app/main.py is created — that's Phase 2)
```

---

## 4. Common Bootstrap Pitfalls

| Problem | Fix |
|---|---|
| `vite: command not found` after `npm create` | Run `npm install` first, then `npm run build` |
| `@types/chrome` not recognized in tests | Add `"types": ["chrome", "vitest/globals"]` to `tsconfig.json` `compilerOptions` |
| Vite build fails on multi-entry with `input` referencing nonexistent files | Create the placeholder entry files listed above |
| Python `ModuleNotFoundError: No module named 'app'` | Run pytest from `gist-backend/` root, not from inside `app/`. Or add a `conftest.py` at root that adds the path |
| `asyncio_mode` not recognized | Ensure `pyproject.toml` is in the `gist-backend/` root, not a subdirectory |
