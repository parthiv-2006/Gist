# Gist Full Dashboard Implementation Plan

## Overview
This document outlines the architectural and aesthetic plan to transform the current simple settings/library area into a full-fledged, aesthetic, and robust dashboard. This layout will be visible when the user opens the extension in a full browser tab (`IS_TAB_MODE === true`).

## 1. Architectural & Layout Restructuring
Currently, `popup/App.tsx` handles both the popup mode and tab mode with simple conditional rendering and a basic top header. We will separate the logic to give the full-page dashboard a dedicated, app-like architecture.

- **Routing / Navigation:** Introduce state-based navigation for the dashboard (`home`, `library`, `settings`).
- **Layout Structure:**
  - **Left Sidebar:** A sleek, glassmorphic vertical sidebar for navigation, containing user profile/app logo, and links to "Overview", "My Library", and "Settings".
  - **Main Content Area:** A large, scrollable container with a subtle radial gradient background that hosts the currently active view.
  - **Command Palette (Optional but recommended):** Implement a `Ctrl+K` command palette for instant jumping between library items or settings.

## 2. Aesthetics & Design System (Premium Feel)
- **Color Palette & Tokens:** Use the existing design tokens (`T.bg`, `T.accent`) but enhance them with deep, rich gradients and glassmorphic overlays. Avoid flat backgrounds.
  - `Background`: Deep black/dark gray (`#080808` to `#111` subtle radial gradient).
  - `Cards`: Translucent elevated backgrounds (`rgba(255, 255, 255, 0.03)`) with delicate borders (`rgba(255, 255, 255, 0.08)`).
- **Typography:** Utilize `Inter` exclusively for cleanly readable UI elements and `Space Mono` for tags, metadata, and code/URL snippets.
- **Animations:** Use CSS transitions for premium micro-interactions:
  - Spring-based hover effects on cards (slight lift and glow).
  - Smooth fade/slide transitions when switching between sidebar tabs.
  - Skeleton loading shimmers for fetching library items.

## 3. Core Dashboard Modules

### A. Home / Overview (New)
A breathtaking entry point that provides instant feedback and value to the user.
- **Activity Heatmap:** Similar to GitHub contributions, showing a grid of days indicating when the user saved and interacted with gists.
- **Library Insights:** AI-generated summary widget of recent topics researched ("You've saved 15 items about *Machine Learning* this week").
- **Metrics Cards:** Clean, minimalist stat blocks indicating Total Gists, Top Categories (e.g., Code, Legal, Science), and Recent Queries.

### B. Library View (Revamp)
Transform the existing vertical list into a powerful search, discovery, and management interface.
- **Advanced Refinement:**
  - A prominent search bar with Semantic RAG querying (existing functionality, but prominent with a glowing accent border).
  - Filter pills below the search: "All", "Categories", "Timeframe".
- **Grid Layouts:** Allow users to view gists as a masonry grid of cards.
- **Split Pane Interface (Crucial):** Clicking a gist card doesn't just expand vertically. Instead, it opens a right-side sliding panel (drawer) showing:
  - The summarized explanation.
  - The exact original text.
  - The source URL with a site favicon.
  - A contextual "Chat with this Gist" box.

### C. Settings Section (New)
A dedicated, robust area for configuring the extension.
- **General Preferences:** Distinct toggle switches for AutoGist ambient scroll, Visual Capture default behavior, and Gist Lens.
- **Data Management:** Interface to export the library (JSON/CSV) and clear local cache/sync with MongoDB.
- **API & Models:** Segmented controls to select primary LLM models and input custom API keys if needed.
- **Aesthetics:** Segmented controls with fluid slider animations instead of basic radio buttons.

## 4. Execution Steps for Claude Code

1. **Extract Dashboard Layout:**
   - Create a new component `src/popup/Dashboard.tsx`.
   - Update `src/popup/App.tsx` to conditionally render `<Dashboard />` instead of the current simple tab layout when `IS_TAB_MODE` is true.
2. **Build the Sidebar Navigation:**
   - Implement vertical navigation and state for `activeRoute` in the new Dashboard layout.
3. **Draft the Base UI Components:**
   - Build updated `GlassCard`, `StatPill`, and `ToggleSwitch` components.
4. **Implement Library Split View:**
   - Migrate the `LibraryView` logic into the new dashboard and update it to use the grid + right-drawer layout.
5. **Implement Settings View:**
   - Create beautiful setting sections spanning AutoGist, Capture, and Storage options, hooked into `chrome.storage.local`.
6. **Refine & Polish:**
   - Add hover states, animated pulsing on search, empty state dynamic illustrations, and premium loading states.

## 5. Non-Negotiable Guidelines
- **NO Generic CSS Frameworks:** Stick to precise, customized inline styles or CSS modules that match the existing `T` token system. Do NOT add Tailwind just for this.
- **Maximum UI Polish:** Ensure the UI scales fluidly. Elements must have appropriate padding, spacing, and font weights to mimic high-end aesthetic apps (like Linear or Vercel).
- **Responsive:** Even as a desktop browser full-page tab, it should handle window resizing elegantly.
