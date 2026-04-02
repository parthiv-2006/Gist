# Gist Sidebar Mode Feature implementation plan

## Overview
The **Sidebar Mode** is a new feature allowing users to undock the Gist interface from the extension popup into a persistent sidebar within the webpage they are currently viewing. This enables the user to view Gist's information side-by-side with the content they are reading or working on without the popup closing on outside clicks. 

## Instructions for LLM
> [!IMPORTANT]  
> **Git Branch Requirement:**
> Before starting any code modifications or implementations, you MUST create and switch to a new branch called `feature/side-bar`. **DO NOT** make these changes on the `main` or `master` branch.
> 
> ```bash
> git checkout -b feature/side-bar
> ```

## Feature Description
1. **Activation:** The user opens the extension popup. Within the popup UI, they can click a new "Open in Sidebar" button (or toggle).
2. **Communication:** The popup sends a message to the background script, which then forwards the request to the content script on the active tab context. Alternatively, it can send it straight to the content script if applicable.
3. **Sidebar Rendering:** The content script injects a sidebar element. To avoid CSS conflicts with the existing page, the UI should be mounted into a Shadow DOM. If it's a completely functional clone of the popup, consider using an `iframe` pointing to a new or existing extension HTML page (e.g., `chrome-extension://<id>/sidebar.html` using the `sidePanel` API or an injected `iframe`).
4. **State Management:** When the sidebar is active, opening the popup again should reflect this state or seamlessly connect to the same state.
5. **Dismissal:** The sidebar should have a "Close" button or an option to return to the popup mode.

## Context Files Required
To implement this feature effectively, the following files will be modified or referenced. Please ensure you review them to understand the existing setup:

### Popup UI
- **`gist-extension/src/popup/App.tsx`**
  - *Purpose:* Add the "Open in Sidebar" UI button/toggle here.
- **`gist-extension/src/popup/index.html`** or related layout files.
  - *Purpose:* For adding any structural needs to the popup.

### Messaging & Event Routing
- **`gist-extension/src/background/index.ts`**
  - *Purpose:* Act as a relay. Receives the `OPEN_SIDEBAR` intent from the popup and signals the specific active tab's content script to execute the actual injection.

### DOM Injection (Content Scripts)
- **`gist-extension/src/content/index.ts`**
  - *Purpose:* Listens for messages from the background script. When the sidebar command is received, it triggers the injection mechanism on the host page.
- **`gist-extension/src/content/shadow-host.ts`**
  - *Purpose:* Current handling for shadow DOM injection. You might adapt this or create a new wrapper specifically to house the sidebar securely without CSS bleed.
- **`gist-extension/src/content/components/`** (Directory)
  - *Purpose:* Build the new React components (e.g., `<Sidebar />`) that will represent the sidebar's UI.

### Configurations
- **`gist-extension/manifest.json`**
  - *Purpose:* You may need to declare new permissions (such as the `sidePanel` permission if utilizing the native Chrome Side Panel API instead of a DOM-injected sidebar) or add elements to `web_accessible_resources` if injecting an extension-hosted `iframe` into the webpage. 

## Proposed Implementation Plan

**Phase 1: Architecture & Prototyping**
- Determine whether to use an **injected DOM/Shadow DOM element** (floating sidebar pushed onto the page layout) OR Chrome's native **`chrome.sidePanel` API**.
  - *Note:* If using standard in-page DOM injection, adjust the page's `body` styling (e.g. `margin-right` or `width`) or float the panel over the page.
  
**Phase 2: UI Updates**
- Update `popup/App.tsx` to include the action button.
- Build the `Sidebar.tsx` component if injecting manually, ensuring the styling matches the existing Carbon UI aesthetic found in `gist-extension/src/popup/App.tsx`.

**Phase 3: Event Wiring**
- Define strict message types for `OPEN_SIDEBAR` and `CLOSE_SIDEBAR`.
- Setup listeners in `content/index.ts` and dispatchers in `background/index.ts`.

**Phase 4: Refinement & State**
- Synchronize state between the Sidebar and the Background Service Worker so they share the same data context as the popup.
- Ensure the sidebar animate-in correctly and accommodates responsive page designs.
