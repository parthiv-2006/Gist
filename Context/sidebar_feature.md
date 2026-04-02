# Gist Sidebar Mode Feature (Implementation Details)

## Overview
The **Sidebar Mode** is a core feature of the Gist extension that allows the UI to transition from a floating, draggable/resizable popover to a persistent, fixed-width side panel (400px) on the right side of the viewport. 

Key product behaviors include:
- **Gist-First Policy**: Chat interaction is disabled until the user creates their first Gist (selection).
- **Persistent Visibility**: Once opened, the UI stays visible even if the sidebar is undocked or a capture is cancelled, until explicitly closed.
- **Unified Logic**: Both floating and sidebar modes share a single React component (`Popover.tsx`) and state management layer (`shadow-host.ts`).

## Technical Architecture

### 1. Host Management (`shadow-host.ts`)
- **Shadow DOM**: The entire Gist UI is mounted inside a single Shadow DOM host (`#gist-shadow-host`) attached to `document.body`.
- **Layout States**:
  - **Floating Mode (Default)**: The `shadowHost` occupies `100vw x 100vh` but uses `pointer-events: none`. The child `Popover` is `fixed` and handles its own pointer events.
  - **Sidebar Mode**: The `shadowHost` is locked to `width: 400px`, `height: 100vh`, and `right: 0`. It uses `pointer-events: auto` to treat the sidebar as a solid application column.
- **Visibility & Persistence**:
  - `isSidebarMode`: Tracks if the sidebar layout is active.
  - `isVisible`: Tracks if the UI should be rendered at all. Set to `true` on sidebar toggle or first Gist; set to `false` only on explicit "Close".
  - `lastState`: Remembers the current phase (`LOADING`, `STREAMING`, `DONE`) during mode transitions to prevent UI "flicker" or state loss.

### 2. Component Logic (`Popover.tsx`)
- **Dual-Mode Component**: Interfaces with `isSidebarMode` and `isVisible` props.
- **Gist Detection**: `isInputDisabled` is calculated by checking `(state === "IDLE" && messages.length === 0)` or if an active stream is running.
- **Conditional States**:
  - **IDLE + Sidebar**: Renders the "Gist Sidebar Ready" empty state.
  - **IDLE + Floating + isVisible**: Renders the "Gist Ready" empty state (useful when undocking an empty sidebar).
  - **IDLE + Floating + !isVisible**: Returns `null` (hidden).
- **Placeholder Logic**: Automatically switches from *"Gist something to chat..."* (disabled) to *"Ask a follow-up..."* (enabled).

### 3. Styling (`Popover.module.css`)
- **Modular CSS**: Uses established "Carbon" tokens for theme consistency.
- **Sidebar Overrides**: The `.sidebar` class applies `top/right/bottom: 0`, removes shadows/radius, and adjusts internal padding for a column-based layout.
- **Disabled Input State**: `.inputBarDisabled` applies a `blur(1.5px)` and `grayscale(0.5)` filter alongside `pointer-events: none` to clearly communicate non-interaction.
- **Chat History**: Uses `flex: 1` and `overflow-y: auto` to ensure the list of messages grows correctly while keeping the input bar pinned to the bottom.

### 4. Messaging Protocol (`messages.ts`)
- **Toggle Command**: `GIST_SIDEBAR_TOGGLE` is sent from `popup/App.tsx` or the header toggle button.
- **Flow**: `chrome.tabs.sendMessage` -> `content/index.ts` -> `shadow-host.ts:toggleSidebar()`.

---

## Edge Case Resolutions (Historical Fixes)

### 1. The "Disappearing UI" Bug
- **Scenario**: User undocks an empty sidebar.
- **Issue**: Since the floating popover was set to hide on `IDLE`, it would vanish when the sidebar flag was toggled off.
- **Fix**: Introduced the `isVisible` flag. Toggling the sidebar sets `isVisible = true`. Even if `isSidebarMode` becomes false, the component remains visible if `isVisible` is true.

### 2. The "Sticky Sidebar" Bug
- **Scenario**: User clicks "Close" (X) while in sidebar mode.
- **Issue**: It would just clear the content but stay in sidebar mode, showing the "Ready" page.
- **Fix**: `unmountPopover()` now explicitly resets `isSidebarMode = false`, `isVisible = false`, and restores the `shadowHost` overlay styles.

### 3. Esc Key Responsiveness
- **Issue**: `Esc` was only listening for non-IDLE states, making it impossible to close the sidebar "Ready" page via keyboard.
- **Fix**: Updated the `useEffect` hook in `Popover.tsx` to listen for `Esc` whenever `isSidebarMode` is active.

---

## Instructions for LLM (Future Work)

### Adding Features
- **Shared UI**: Most UI changes should be tested in BOTH modes. Use the `.sidebar` scope in CSS for sidebar-only tweaks.
- **Height Constraints**: The sidebar is `100vh`. Ensure any new absolute elements don't cause vertical scrolling of the whole panel.
- **Chat Policy**: Do not allow manual queries before the first Gist is generated. This is controlled by `isInputDisabled` in `Popover.tsx`.

### Core Context Files
- `src/content/shadow-host.ts`: Layout management and global state.
- `src/content/components/Popover.tsx`: Main UI and transition logic.
- `src/content/components/Popover.module.css`: Carbon design and sidebar overrides.
