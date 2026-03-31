---
name: popover-design
description: >
  Visual design specification for the Gist popover UI component.
  Defines the exact color palette, typography, spacing, animation timings,
  and CSS custom properties. Apply this spec when implementing
  src/content/components/Popover.tsx and its CSS Module stylesheet.
  All values are mandatory — do not substitute or approximate.
---

## Design Language

**Style:** Dark glassmorphism — a floating dark panel with backdrop blur,
subtle border, and a soft glow. Feels premium and non-intrusive on any
webpage background. High contrast text ensures readability everywhere.

---

## 1. CSS Custom Properties (Design Tokens)

Create `src/content/components/Popover.module.css` with these tokens at the top:

```css
/* src/content/components/Popover.module.css */

.popover {
  /* ─── Color Palette ─────────────────────────────────────── */
  --gist-bg:              hsla(240, 15%, 10%, 0.88);   /* near-black with slight purple tint */
  --gist-bg-hover:        hsla(240, 15%, 14%, 0.92);
  --gist-border:          hsla(265, 50%, 60%, 0.30);   /* subtle purple border */
  --gist-border-strong:   hsla(265, 50%, 60%, 0.60);
  --gist-backdrop:        blur(20px) saturate(180%);

  /* ─── Accent ────────────────────────────────────────────── */
  --gist-accent:          hsl(265, 89%, 78%);          /* soft lavender-purple */
  --gist-accent-glow:     hsla(265, 89%, 78%, 0.25);

  /* ─── Text ──────────────────────────────────────────────── */
  --gist-text-primary:    hsl(220, 30%, 96%);          /* near-white */
  --gist-text-secondary:  hsl(220, 15%, 65%);          /* muted grey */
  --gist-text-error:      hsl(0, 80%, 72%);            /* soft red */

  /* ─── Skeleton / Loading ────────────────────────────────── */
  --gist-skeleton-base:   hsla(240, 10%, 20%, 1);
  --gist-skeleton-shine:  hsla(240, 10%, 30%, 1);

  /* ─── Typography ────────────────────────────────────────── */
  --gist-font-family:     'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --gist-font-size-body:  14px;
  --gist-font-size-label: 11px;
  --gist-line-height:     1.6;
  --gist-font-weight-regular: 400;
  --gist-font-weight-medium:  500;

  /* ─── Spacing ───────────────────────────────────────────── */
  --gist-padding:         16px;
  --gist-gap:             10px;
  --gist-radius:          12px;
  --gist-radius-sm:       8px;

  /* ─── Sizing ────────────────────────────────────────────── */
  --gist-width:           320px;
  --gist-min-height:      80px;
  --gist-max-height:      260px;

  /* ─── Shadows & Glow ────────────────────────────────────── */
  --gist-shadow:
    0 8px 32px hsla(240, 20%, 5%, 0.55),
    0 2px 8px  hsla(240, 20%, 5%, 0.30),
    0 0 0 1px var(--gist-border);
  --gist-shadow-accent:
    0 0 0 1px var(--gist-border-strong),
    0 0 20px var(--gist-accent-glow);

  /* ─── Animation ─────────────────────────────────────────── */
  --gist-duration-enter:  180ms;
  --gist-duration-exit:   120ms;
  --gist-ease-enter:      cubic-bezier(0.22, 1, 0.36, 1);
  --gist-ease-exit:       cubic-bezier(0.55, 0, 1, 0.45);
}
```

---

## 2. Font Loading

Inject Inter inside the Shadow DOM host, not in the main page `<head>`.
Add this inside `src/content/shadow-host.ts` when creating the shadow root:

```typescript
// Inside the createShadowHost function, BEFORE mounting React:
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap";
shadowRoot.appendChild(fontLink);
```

---

## 3. Popover Container

```css
.popover {
  /* All tokens defined above are available here */
  position: fixed;
  z-index: 2147483647;  /* Max z-index — above everything */
  width: var(--gist-width);
  min-height: var(--gist-min-height);
  max-height: var(--gist-max-height);
  overflow-y: auto;

  font-family: var(--gist-font-family);
  font-size: var(--gist-font-size-body);
  line-height: var(--gist-line-height);
  color: var(--gist-text-primary);

  background: var(--gist-bg);
  -webkit-backdrop-filter: var(--gist-backdrop);
  backdrop-filter: var(--gist-backdrop);
  border-radius: var(--gist-radius);
  box-shadow: var(--gist-shadow);
  padding: var(--gist-padding);

  /* Entrance animation */
  animation: gist-enter var(--gist-duration-enter) var(--gist-ease-enter) both;
}

@keyframes gist-enter {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.popover::-webkit-scrollbar {
  width: 4px;
}
.popover::-webkit-scrollbar-track {
  background: transparent;
}
.popover::-webkit-scrollbar-thumb {
  background: var(--gist-border);
  border-radius: 4px;
}
```

---

## 4. Header / Branding Bar

```css
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--gist-gap);
}

.brand {
  font-size: var(--gist-font-size-label);
  font-weight: var(--gist-font-weight-medium);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--gist-accent);
}

.closeButton {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--gist-radius-sm);
  background: transparent;
  color: var(--gist-text-secondary);
  cursor: pointer;
  font-size: 16px;
  transition: background 100ms ease, color 100ms ease;
  padding: 0;
}

.closeButton:hover {
  background: var(--gist-bg-hover);
  color: var(--gist-text-primary);
}

.closeButton:focus-visible {
  outline: 2px solid var(--gist-accent);
  outline-offset: 2px;
}
```

---

## 5. Skeleton / Loading State

Three animated shimmer lines of different widths.

```css
.skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
}

.skeletonLine {
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    var(--gist-skeleton-base) 25%,
    var(--gist-skeleton-shine) 50%,
    var(--gist-skeleton-base) 75%
  );
  background-size: 200% 100%;
  animation: gist-shimmer 1.4s infinite;
}

.skeletonLine:nth-child(1) { width: 100%; }
.skeletonLine:nth-child(2) { width: 85%; }
.skeletonLine:nth-child(3) { width: 60%; }

@keyframes gist-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

**JSX:**
```tsx
<div className={styles.skeleton} data-testid="gist-skeleton" aria-label="Loading explanation">
  <div className={styles.skeletonLine} />
  <div className={styles.skeletonLine} />
  <div className={styles.skeletonLine} />
</div>
```

---

## 6. Explanation Text (STREAMING / DONE states)

```css
.explanation {
  color: var(--gist-text-primary);
  font-size: var(--gist-font-size-body);
  line-height: var(--gist-line-height);
  font-weight: var(--gist-font-weight-regular);
  white-space: pre-wrap;
  word-break: break-word;
}

/* Streaming cursor blink — remove once DONE */
.explanation.streaming::after {
  content: '▌';
  color: var(--gist-accent);
  animation: gist-blink 0.7s step-end infinite;
}

@keyframes gist-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}
```

---

## 7. Error State

```css
.errorCard {
  background: hsla(0, 60%, 20%, 0.5);
  border: 1px solid hsla(0, 60%, 40%, 0.4);
  border-radius: var(--gist-radius-sm);
  padding: 10px 12px;
  color: var(--gist-text-error);
  font-size: var(--gist-font-size-body);
  line-height: var(--gist-line-height);
}

.errorHint {
  margin-top: 6px;
  font-size: var(--gist-font-size-label);
  color: var(--gist-text-secondary);
}
```

**JSX:**
```tsx
<div className={styles.errorCard} role="alert">
  <p>{error ?? "Something went wrong."}</p>
  <p className={styles.errorHint}>Try highlighting a shorter passage.</p>
</div>
```

---

## 8. Popover Positioning

The popover should anchor just above (or below if near top of viewport) the
text selection. Use this positioning logic in `src/content/index.ts`:

```typescript
function getPopoverPosition(rect: DOMRect): { top: number; left: number } {
  const POPOVER_HEIGHT = 200; // estimated max height in px
  const MARGIN = 12;
  const POPOVER_WIDTH = 320;

  let top = rect.bottom + window.scrollY + MARGIN;
  let left = rect.left + window.scrollX;

  // Flip above selection if not enough space below
  if (rect.bottom + POPOVER_HEIGHT + MARGIN > window.innerHeight) {
    top = rect.top + window.scrollY - POPOVER_HEIGHT - MARGIN;
  }

  // Clamp left so popover doesn't overflow right edge
  left = Math.min(left, window.innerWidth - POPOVER_WIDTH - MARGIN);
  left = Math.max(MARGIN, left);

  return { top, left };
}
```

---

## 9. ARIA Attributes (Required)

The popover container must have:
```tsx
<div
  className={styles.popover}
  role="dialog"
  aria-label="Gist explanation"
  aria-live="polite"          // announces streaming text to screen readers
  style={{ top: `${position.top}px`, left: `${position.left}px` }}
>
```

---

## 10. Do Not

- Do NOT use Tailwind, Bootstrap, or any external CSS framework.
- Do NOT use inline styles except for dynamic positioning (`top`, `left`).
- Do NOT add animations with `transition` to the popover mount — use the `@keyframes gist-enter` defined above.
- Do NOT set `z-index` less than `2147483647` on the popover — host pages often have high z-index overlays.
