/**
 * render_diagram.js
 * Produces popover-mermaid.png: the real Mermaid SVG that the /visualize endpoint
 * generates (via Groq + mermaid.ink), rendered inside a Gist-styled dark card.
 *
 * The diagram cannot be reliably captured inside the live popover because the tall
 * mermaid SVG collapses in the popover's flex layout — so we render the genuine
 * backend output in a card that matches the extension's visual design.
 */
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');

const SS_DIR = path.resolve(__dirname, '../.github/assets/screenshots');
const BACKEND = 'http://localhost:8000';

const CONCEPT =
  'Photosynthesis: plants absorb sunlight, water, and carbon dioxide, then convert them ' +
  'in the chloroplast into glucose for energy and release oxygen as a byproduct.';

function postVisualize(text) {
  const body = JSON.stringify({ text });
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${BACKEND}/api/v1/visualize`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  console.log('Requesting diagram from /visualize ...');
  let svg = null;
  for (let i = 1; i <= 5 && !svg; i++) {
    const resp = await postVisualize(CONCEPT);
    svg = resp.svg || null;
    if (!svg) { console.log(`  attempt ${i}: no svg (source=${!!resp.source}) — retrying`); await new Promise(r => setTimeout(r, 4000)); }
  }
  if (!svg) { console.error('Could not obtain an SVG from /visualize'); process.exit(1); }
  console.log('Got SVG — rendering styled card.');

  // Gist popover aesthetic: near-black bg, subtle border, muted uppercase label,
  // green accent. mermaid.ink SVGs use light fills, so force text/edges to light.
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { margin: 0; box-sizing: border-box; }
    body { background: transparent; }
    .card {
      width: 440px;
      background: #0c0c11;
      border: 1px solid #23232c;
      border-radius: 14px;
      overflow: hidden;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      box-shadow: 0 12px 40px rgba(0,0,0,0.5);
    }
    .label {
      font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
      color: #6f6f7d; padding: 12px 16px 10px; border-bottom: 1px solid #1c1c24;
      display: flex; align-items: center; gap: 7px;
    }
    .label .dot { width: 7px; height: 7px; border-radius: 50%; background: #34d399; }
    .diagram { padding: 18px 16px 20px; display: flex; justify-content: center; }
    .diagram svg { max-width: 100%; height: auto; }
    /* mermaid.ink renders light fills/text — recolor for the dark card */
    .diagram svg text { fill: #e7e7ea !important; }
    .diagram svg .edgePath path, .diagram svg path.flowchart-link { stroke: #4b5563 !important; }
    .diagram svg .node rect, .diagram svg .node polygon, .diagram svg .node circle,
    .diagram svg .node path { fill: #15151c !important; stroke: #34d399 !important; }
  </style></head>
  <body><div class="card">
    <div class="label"><span class="dot"></span>Visual diagram</div>
    <div class="diagram">${svg}</div>
  </div></body></html>`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 700, height: 900 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const card = page.locator('.card');
  await card.screenshot({ path: path.join(SS_DIR, 'popover-mermaid.png') });
  console.log('Saved popover-mermaid.png');
  await browser.close();
})();
