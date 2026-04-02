# Sidebar Mode Implementation Walkthrough

The Sidebar Mode allows users to transform the Gist explanation popover into a persistent, fixed-width sidebar on the right side of the page. This is useful for keeping explanations visible while scrolling or interacting with the rest of the page.

## Changes Made

### 1. Messaging System Update
Modified `src/utils/messages.ts` to include a new message type `GIST_SIDEBAR_TOGGLE`. This allows communication between the popup and the content script to activate the sidebar.

### 2. Popup UI Enhancement
Updated `src/popup/App.tsx` to include a new **"Sidebar Mode"** button. This button sends the toggle signal to the current active tab and closes the popup.

### 3. Content Script Integration
- **`src/content/index.ts`**: Now listens for the `GIST_SIDEBAR_TOGGLE` message and calls the internal toggle function.
- **`src/content/shadow-host.ts`**: 
    - Added state tracking for `isSidebarMode`.
    - Implemented `toggleSidebar()` which dynamically switches the Shadow DOM's container size and positioning.
    - When active, the container is set to `400px` fixed on the right with `pointer-events: auto`.

### 4. Popover Component Styling
Updated `src/content/components/Popover.tsx`:
- Accepts `isSidebarMode` prop.
- Applies conditional styling:
    - **Sidebar Mode**: Fixed `0,0` at the right, `100vh` height, no rounded corners on the left, and a subtle border.
    - **Floating Mode**: Reverts to the draggable/resizable floating panel.
- Disables the resize handle while in Sidebar Mode.

## How to Test
1. Build the extension.
2. Open the Gist popup.
3. Click "Sidebar Mode".
4. Observe the interface snapping to the right side of the screen.
5. Highlight some text to see the explanation appear within the sidebar.
