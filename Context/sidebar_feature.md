# Gist Sidebar Mode Feature (Implementation Details)

## Overview
The **Sidebar Mode** is a core feature of the Gist extension that allows the UI to transition from a floating, draggable/resizable popover to a persistent, fixed-width side panel (400px) on the right side of the viewport. This mode is designed for long-form reading and continuous interaction without blocking the center of the page.

## Technical Architecture

### 1. Host Management (`shadow-host.ts`)
- **Shadow DOM**: The entire Gist UI (Popover and Sidebar) is mounted inside a single Shadow DOM host attached to `document.body`. This prevents host-page CSS from bleeding into the extension.
- **Layout States**:
  - **Floating Mode (Default)**: The `shadowHost` occupies `0x0` space but has `pointer-events: none`. The child `Popover` is `fixed` and handles its own positioning.
  - **Sidebar Mode**: The `shadowHost` is locked to `width: 400px`, `height: 100vh`, and `right: 0`. It uses `pointer-events: auto` to ensure the sidebar is interactive.
- **State Persistence**: The `shadow-host.ts` module tracks `lastState` (e.g., `LOADING`, `STREAMING`, `DONE`). When toggling between modes, it re-renders the Popover with the previous state to ensure the UI doesn't disappear if it was mid-task or empty.

### 2. Component Logic (`Popover.tsx`)
- **Dual-Mode Component**: The `Popover` component accepts an `isSidebarMode` prop.
- **Conditional Styling**:
  - In **Sidebar Mode**, most inline positioning styles (left/top/width/height) are disabled or set to fixed values (top: 0, right: 0, width: 400px, height: 100vh).
  - High-res CSS overrides are applied via the `.sidebar` class in `Popover.module.css`.
- **TTS Integration**: The Header includes controls for Text-to-Speech (`Volume2`, `VolumeX`) and the Sidebar Toggle (`Layout`).

### 3. Styling (`Popover.module.css`)
- **Modular CSS**: Styling is handled via CSS Modules with a custom "Carbon" theme (dark, high-contrast).
- **Sidebar Overrides**: The `.sidebar` class removes border-radius and box-shadows to blend into the browser edge. It also adds specific padding (`16px 20px`) to align content professionally.
- **Input Bar**: The input area is a fixed-height (`min-height: 56px`) flex item pinned to the bottom. It utilizes an `inputBarWrapper` to create a pill-shaped "search bar" aesthetic.

### 4. Messaging Protocol (`messages.ts`)
- **Toggle Command**: `GIST_SIDEBAR_TOGGLE` is sent from the Popup (`App.tsx`) or triggered internally via the `Layout` icon in the Popover header.
- **Routing**:
  - `popup/App.tsx` -> `chrome.tabs.sendMessage` -> `content/index.ts` -> `shadow-host.ts:toggleSidebar()`.

---

## Instructions for LLM (Future Work)

### Adding Features to the Sidebar
- If you need to modify the Sidebar UI, always check if the change should apply to **both** modes or just the sidebar. Use the `isSidebarMode` flag in `Popover.tsx`.
- Adjusting the sidebar width requires updates in both `shadow-host.ts` (host width) and `Popover.module.css` (component width).

### Layout & Clipping Issues
- The Sidebar uses `height: 100vh` and `display: flex; flex-direction: column`. 
- **CRITICAL**: The `chatHistory` div must have `flex: 1` and `overflow-y: auto` to ensure the `inputBar` at the bottom remains visible and is not pushed off-screen.
- Use `box-sizing: border-box` for all new elements to prevent padding from breaking the `100vh` constraint.

### UI Consistency
- Follow the **Carbon** design tokens defined in the `.popover` root of `Popover.module.css` (e.g., `--gist-border`, `--gist-bg-hover`).
- Avoid adding manual hex colors; use the established variables for theme consistency.

---

## Context Files

- **`src/content/shadow-host.ts`**: Core logic for DOM injection and layout state management.
- **`src/content/components/Popover.tsx`**: Main UI entry point for both modes.
- **`src/content/components/Popover.module.css`**: Styling definitions and layout constraints.
- **`src/utils/messages.ts`**: Type definitions for cross-script communication.
- **`src/popup/App.tsx`**: Implementation of the primary toggle button.
