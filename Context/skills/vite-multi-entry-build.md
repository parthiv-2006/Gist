---
name: vite-multi-entry-build
description: >
  How to configure Vite for a Chrome Extension that requires multiple independent
  entry points (content script, background service worker, popup). Standard Vite
  assumes a single HTML entry. This skill explains how to override that with a
  library-mode or multi-input rollup config to produce separate JS bundles
  that Chrome can load independently.
  Use this skill when setting up or modifying the Vite build pipeline for Gist.
---

## Overview

A Chrome Extension needs **three separate JavaScript bundles** — Vite produces one by default. We need to configure Vite's underlying Rollup bundler to produce multiple independent outputs.

```
src/background/index.ts  →  dist/background/index.js   (service worker)
src/content/index.ts     →  dist/content/index.js      (injected into pages)
src/popup/index.html     →  dist/popup/index.html       (extension popup)
```

---

## 1. Install Dependencies

```bash
npm create vite@latest gist-extension -- --template react-ts
cd gist-extension
npm install
npm install -D @crxjs/vite-plugin   # optional but recommended for HMR
```

**Core dependencies for the extension:**
```bash
npm install react react-dom
npm install -D @types/chrome vitest @testing-library/react @testing-library/jest-dom jsdom
```

---

## 2. `vite.config.ts` — Multi-Entry Configuration

This is the critical file. Use Rollup's `input` option to declare multiple entry points.

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],

  build: {
    // Output goes to dist/ — this is what you point Chrome at
    outDir: "dist",
    emptyOutDir: true,

    rollupOptions: {
      // Multiple entry points — one per extension context
      input: {
        background: resolve(__dirname, "src/background/index.ts"),
        content: resolve(__dirname, "src/content/index.ts"),
        popup: resolve(__dirname, "src/popup/index.html"),
      },

      output: {
        // Preserve the directory structure in output
        entryFileNames: "[name]/index.js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[ext]",
      },
    },
  },

  // Vitest configuration lives here too
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./tests/setup.ts",
  },
});
```

---

## 3. `tsconfig.json` — Chrome Types

Add `@types/chrome` to get full TypeScript intellisense for the Chrome Extension API.

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
    "noFallthroughCasesInSwitch": true,
    "types": ["chrome", "vitest/globals"]
  },
  "include": ["src", "tests"]
}
```

---

## 4. `package.json` Scripts

```json
{
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "type-check": "tsc --noEmit"
  }
}
```

> **Key:** `npm run dev` uses `--watch` mode. Vite rebuilds on every file save, so you only need to click refresh in `chrome://extensions` to see changes.

---

## 5. Vitest Setup File (`tests/setup.ts`)

This file runs before every test and globally mocks the Chrome Extension API.

```typescript
// tests/setup.ts
import "@testing-library/jest-dom";
import { vi } from "vitest";

// Global Chrome API mock — available in all test files without re-importing
vi.stubGlobal("chrome", {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
  },
  contextMenus: {
    create: vi.fn(),
    onClicked: {
      addListener: vi.fn(),
    },
  },
  commands: {
    onCommand: {
      addListener: vi.fn(),
    },
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
    session: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  tabs: {
    sendMessage: vi.fn(),
    query: vi.fn(),
  },
});
```

---

## 6. Output Structure After `npm run build`

```
dist/
├── background/
│   └── index.js        ← registered in manifest.json as service_worker
├── content/
│   └── index.js        ← registered in manifest.json as content_scripts
├── popup/
│   └── index.html      ← registered in manifest.json as default_popup
├── chunks/
│   └── *.js            ← shared code chunks (React, etc.)
└── assets/
    └── *.css / *.png   ← stylesheets and images
```

---

## 7. Referencing Correct Paths in `manifest.json`

After building, `manifest.json` must point to the compiled output paths:

```json
{
  "background": {
    "service_worker": "dist/background/index.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["dist/content/index.js"]
    }
  ],
  "action": {
    "default_popup": "dist/popup/index.html"
  }
}
```

> **If using `@crxjs/vite-plugin`:** The plugin handles all of this automatically and enables true HMR in the extension. Replace the manual Rollup config above with the crxjs plugin config from its docs.

---

## 8. Common Pitfalls

| Pitfall | Fix |
|---|---|
| `import.meta.hot` crashing the service worker | Service workers don't support HMR. Add `filter: /background/` to exclude it from HMR in crxjs config |
| `require` is not defined in the content script | Vite outputs ESM. Ensure `manifest.json` has `"type": "module"` in the service_worker section |
| CSS imported in the content script leaks to host page | Do NOT use Vite's CSS injection in content scripts. Import CSS as a string and inject it into the Shadow DOM manually (see: `shadow-dom-react-injection` skill) |
| Multiple builds of React bundled (one per entry) | Move React to `optimizeDeps` and use `rollupOptions.external` for shared chunks |
