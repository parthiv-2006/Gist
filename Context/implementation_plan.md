# Goal: Gist Diagrams (Visual Analogies)

You asked for a high-impact, "bang for buck" feature. I've analyzed the codebase and the original PRD, and there is one feature that stands out: **Gist Diagrams (Visual Analogies)**. 

**Why this feature?**
Your V3 PRD clearly lists "Visual Analogies" (generating Mermaid/ASCII diagrams) as a core goal. However, I noticed that in `Mermaid.tsx`, you currently only render the *raw text* of the Mermaid diagram because importing the actual `mermaid` JS library crashes Chrome's `content.js` due to `KaTeX` BOM and UTF-16 surrogate errors during Vite bundling. 

This plan implements **actual, beautiful visual diagrams** into the popover, completely bypassing the complicated Chrome bundling issue. It transforms a text-based tool into a premium, multi-modal educational companion.

## Proposed Changes

### 1. New Backend Mechanism (The "SVG Pipeline")
Instead of attempting to bundle `mermaid.js` inside the Chrome extension's `content.js`, we will perform the rendering entirely outside the content script. We have two architectural paths:

**Path A (Backend-Driven):** 
1. The user asks for a diagram. 
2. The FastAPI backend asks Gemini to generate Mermaid syntax.
3. The FastAPI backend uses the public API `https://mermaid.ink/svg/...` (or `kroki.io`) to convert the Mermaid markdown into an SVG string.
4. The backend streams the raw SVG text to the frontend.
5. The frontend safely renders the SVG inside the Shadow DOM using standard `dangerouslySetInnerHTML` (sanitized). 
*Pros: Zero frontend payload impact. Safest.*

**Path B (Sandboxed IFrame):**
1. Host a tiny static HTML file (`diagram.html`) inside the extension's `public/` directory that imports Mermaid from a CDN.
2. The Popover passes the LLM-generated Mermaid text to the iframe via `postMessage`.
3. The iframe renders the diagram and auto-resizes.
*Pros: Completely offline. No third-party rendering APIs required.*

**I recommend Path A** as it is the most robust and requires the least amount of DOM hacking in the extension framework.

### 2. Extension UI & Trigger (`Popover.tsx`)
- **New Button**: Add a "Draw it" or "Visualize" button in the normal text-explanation view or Sidebar.
- **Loading State**: A specialized shimmer stating "Drawing diagram..."
- **Renderer**: Replace the raw `<pre>` block in `Mermaid.tsx` with a component that renders the visual SVG outcome.

### 3. Backend Generation (`app/routes/visualize.py`)
- New endpoint `POST /api/v1/visualize`
- Custom Gemini Prompt: *"Create a concept map using Mermaid.js syntax for the following text. Do not return any other text. Output only valid Mermaid markdown."*
- Python pipeline to encode the text to Base64 and fetch the SVG from a rendering service, returning the raw SVG string to the client.

---

> [!IMPORTANT]
> ## User Review Required
> Please confirm if you approve of adding **Visual Diagrams**. Do you prefer **Path A (Backend SVG generation via API)** or **Path B (Local Sandboxed Iframe)**? I heavily recommend Path A for the quickest "bang for buck" implementation without fragile Webpack/Vite config hacking.

## Open Questions
- Is there an existing backend endpoint you'd prefer I hook this into, or should I create a fresh `/visualize` FastAPI router?
- Do you want this feature accessible from the main floating popover, or only from the Sidebar?

## Verification Plan

### Automated Tests
- Pytest for the new FastAPI endpoint ensuring valid SVG response.
- Vitest to ensure the new `Mermaid.tsx` correctly sanitizes and mounts SVG nodes.

### Manual Verification
- Highlight a complex paragraph (like server-side rendering architecture).
- Click "Visualize".
- Confirm the popover renders a true, colorful flow diagram rather than a raw code block.
