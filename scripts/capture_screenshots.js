/**
 * capture_screenshots.js
 * Launches Chromium with the Gist extension loaded and captures all README screenshots.
 *
 * Usage: node capture_screenshots.js
 */

const { chromium } = require('playwright');
const path = require('path');
const os   = require('os');
const fs   = require('fs');

const DIST_PATH = path.resolve(__dirname, '../gist-extension/dist');
const SS_DIR    = path.resolve(__dirname, '../.github/assets/screenshots');
const USER_DATA = path.join(os.tmpdir(), 'gist-pw-fresh');

const delay = ms => new Promise(r => setTimeout(r, ms));

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(SS_DIR, name) });
  console.log(`  ✓  ${name}`);
}

// Screenshot clipped to the popover element (+ padding) so feature detail is legible.
// Falls back to a full-page shot if the popover bounds can't be resolved.
async function screenshotPopover(page, name, pad = 24) {
  const box = await page.evaluate(() => {
    const host = document.querySelector('#gist-shadow-host');
    if (!host?.shadowRoot) return null;
    const el = host.shadowRoot.querySelector('[class*="popover"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return null;
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (!box) {
    await page.screenshot({ path: path.join(SS_DIR, name) });
    console.log(`  ✓  ${name} (full page — no popover bounds)`);
    return;
  }
  const vp = page.viewportSize();
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const width  = Math.min(vp.width  - x, box.width  + pad * 2);
  const height = Math.min(vp.height - y, box.height + pad * 2);
  await page.screenshot({ path: path.join(SS_DIR, name), clip: { x, y, width, height } });
  console.log(`  ✓  ${name} (clipped ${Math.round(width)}×${Math.round(height)})`);
}

async function main() {
  // Always start with a clean profile so session-restore doesn't redirect us
  if (fs.existsSync(USER_DATA)) {
    fs.rmSync(USER_DATA, { recursive: true, force: true });
  }
  fs.mkdirSync(SS_DIR, { recursive: true });
  fs.mkdirSync(USER_DATA, { recursive: true });

  console.log('🚀  Launching Chromium with Gist extension...');
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    headless: false,
    args: [
      `--disable-extensions-except=${DIST_PATH}`,
      `--load-extension=${DIST_PATH}`,
      '--window-size=1440,900',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate',
    ],
    viewport: { width: 1440, height: 900 },
  });

  // Discover extension ID from service worker
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  await delay(1500);
  const EXT_ID = sw.url().split('/')[2];
  console.log(`   Extension ID: ${EXT_ID}\n`);

  // Trigger gist on the active tab.
  // NOTE: Playwright CDP returns null for tab.url in extension context — use active:true instead.
  const triggerGistOn = async (_page) => {
    const result = await sw.evaluate(async () => {
      // Get all tabs and find the one that's most likely our Wikipedia page.
      // Playwright CDP exposes tabs with null URLs, so we try active first,
      // then fall back to the tab with the highest ID (last opened).
      const allTabs = await chrome.tabs.query({});
      const activeTabs = await chrome.tabs.query({ active: true });
      const tab = activeTabs[0] ?? allTabs.sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0];
      if (!tab?.id) return { error: 'no tab', tabCount: allTabs.length };
      // Inject content script if needed
      try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }); } catch {}
      await new Promise(r => setTimeout(r, 400));
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'GIST_SHORTCUT_TRIGGERED', payload: {} });
        return { ok: true, tabId: tab.id };
      } catch (e) {
        return { error: String(e), tabId: tab.id };
      }
    });
    console.log(`     triggerGistOn: ${JSON.stringify(result)}`);
  };

  // Wait for the popover to become active: #gist-mount gets children when Popover renders
  const waitForPopover = async (page, timeout = 20000) => {
    try {
      await page.waitForFunction(() => {
        const host = document.querySelector('#gist-shadow-host');
        if (!host?.shadowRoot) return false;
        const mount = host.shadowRoot.querySelector('#gist-mount');
        return mount ? mount.childElementCount > 0 : false;
      }, { timeout });
      return true;
    } catch {
      console.log('     ⚠  Popover timed out — screenshotting anyway');
      return false;
    }
  };

  // Wait for specific text in shadow DOM (e.g. 'Save' button = done state)
  const waitForShadowText = async (page, text, timeout = 30000) => {
    try {
      await page.waitForFunction((t) => {
        const host = document.querySelector('#gist-shadow-host');
        if (!host?.shadowRoot) return false;
        return host.shadowRoot.textContent?.includes(t) ?? false;
      }, text, { timeout });
    } catch {
      console.log(`     ⚠  Timed out waiting for '${text}'`);
    }
  };

  // Click a button inside the shadow DOM by text
  const shadowClick = async (page, textOrRegex) => {
    await page.evaluate((t) => {
      const host = document.querySelector('#gist-shadow-host');
      if (!host?.shadowRoot) return;
      const btns = [...host.shadowRoot.querySelectorAll('button')];
      const btn = t instanceof RegExp
        ? btns.find(b => t.test(b.textContent ?? ''))
        : btns.find(b => (b.textContent ?? '').includes(t));
      if (btn) btn.click();
    }, textOrRegex instanceof RegExp ? textOrRegex : textOrRegex);
  };

  // Wait for a button matching an aria-label substring to exist in the shadow DOM
  const waitForShadowBtn = async (page, ariaSubstr, timeout = 30000) => {
    try {
      await page.waitForFunction((sub) => {
        const host = document.querySelector('#gist-shadow-host');
        if (!host?.shadowRoot) return false;
        return [...host.shadowRoot.querySelectorAll('button')]
          .some(b => (b.getAttribute('aria-label') ?? '').includes(sub));
      }, ariaSubstr, { timeout });
      return true;
    } catch {
      console.log(`     ⚠  Timed out waiting for button [aria-label*="${ariaSubstr}"]`);
      return false;
    }
  };

  // Click a button by aria-label substring; returns true if found+clicked
  const shadowClickAria = async (page, ariaSubstr) => {
    return page.evaluate((sub) => {
      const host = document.querySelector('#gist-shadow-host');
      if (!host?.shadowRoot) return false;
      const btn = [...host.shadowRoot.querySelectorAll('button')]
        .find(b => (b.getAttribute('aria-label') ?? '').includes(sub));
      if (!btn) return false;
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, view: window }));
      return true;
    }, ariaSubstr);
  };

  // ─────────────────────────────────────────────────────────────
  // ONBOARDING
  // ─────────────────────────────────────────────────────────────
  console.log('📸  Onboarding flow...');
  const ob = await ctx.newPage();
  await ob.setViewportSize({ width: 600, height: 800 });
  await ob.goto(`chrome-extension://${EXT_ID}/onboarding.html`);
  await delay(1000);
  await screenshot(ob, 'onboarding-welcome.png');

  const clickOnboardBtn = async (text) => {
    await ob.locator('button').filter({ hasText: new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first().click();
    await delay(700);
  };

  await clickOnboardBtn('Take the tour');      await screenshot(ob, 'onboarding-highlight.png');
  await clickOnboardBtn('Next: AutoGist');     await screenshot(ob, 'onboarding-autogist.png');
  await clickOnboardBtn('Next: All features'); await screenshot(ob, 'onboarding-features.png');
  await clickOnboardBtn("Let's go");           await screenshot(ob, 'onboarding-done.png');
  await ob.close();

  // ─────────────────────────────────────────────────────────────
  // DASHBOARD / POPUP VIEWS
  // ─────────────────────────────────────────────────────────────
  console.log('\n📸  Dashboard views...');
  const dash = await ctx.newPage();
  await dash.setViewportSize({ width: 1440, height: 750 });
  await dash.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await delay(2000);
  await screenshot(dash, 'dashboard.png');

  // Nav labels: Overview, Library, Synapse, Recall (may have badge), Settings
  const navClick = async (label, extra = 1200) => {
    await dash.locator('button').filter({ hasText: new RegExp(label, 'i') }).first().click();
    await delay(extra);
  };

  await navClick('Library');
  await screenshot(dash, 'library-grid.png');

  // Click first list item for detail pane
  const card = dash.locator('li, article, [role="listitem"], [class*="Row"], [class*="row"]').first();
  if (await card.count() > 0) {
    await card.click(); await delay(800);
  }
  await screenshot(dash, 'library-detail.png');

  // Search: click "Search library…" button, fill, submit
  try {
    await dash.locator('button').filter({ hasText: /Search library/i }).first().click({ timeout: 5000 });
    await delay(500);
    await dash.locator('input[type="text"], input[type="search"], textarea').first().fill('What is machine learning?');
    await dash.keyboard.press('Enter');
    await delay(4500);
  } catch { console.log('     (search button not found)'); }
  await screenshot(dash, 'library-search.png');

  await navClick('Synapse', 2500); await screenshot(dash, 'synapse-graph.png');
  await navClick('Recall',  1000); await screenshot(dash, 'recall-cards.png');
  await navClick('Settings',  500); await screenshot(dash, 'settings.png');
  await dash.close();

  // ─────────────────────────────────────────────────────────────
  // WIKIPEDIA — POPOVER FLOW
  // ─────────────────────────────────────────────────────────────
  console.log('\n📸  Popover on Wikipedia...');
  const wiki = await ctx.newPage();
  await wiki.setViewportSize({ width: 1440, height: 900 });
  await wiki.goto('https://en.wikipedia.org/wiki/Artificial_intelligence', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await delay(2000);
  console.log(`     Page URL: ${wiki.url()}`);

  // Dismiss donation banner / overlay if present
  try {
    await wiki.locator('a, button').filter({ hasText: /Maybe later|No thanks/i }).first().click({ timeout: 3000 });
    await delay(400);
  } catch {}
  await wiki.keyboard.press('Escape');
  await delay(300);

  // Select text from the article — try specific snippet then fall back to first paragraph
  const selResult = await wiki.evaluate(() => {
    const snippet = 'capability of computational systems to perform tasks';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.textContent.indexOf(snippet.substring(0, 25));
      if (idx !== -1) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, Math.min(idx + snippet.length, node.textContent.length));
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        return 'snippet:' + node.textContent.substring(idx, idx + 30);
      }
    }
    // Fallback: select first body paragraph
    const paras = document.querySelectorAll('.mw-parser-output > p');
    for (const p of paras) {
      const text = p.textContent.trim();
      if (text.length > 60) {
        const range = document.createRange();
        range.selectNodeContents(p);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        return 'paragraph:' + text.substring(0, 40);
      }
    }
    return 'none';
  });
  console.log(`     Selection: ${selResult}`);
  await delay(500);

  // Helper: detect popover ERROR state (Gemini 503 high-demand throttling is intermittent)
  const popoverErrored = () => wiki.evaluate(() => {
    const host = document.querySelector('#gist-shadow-host');
    const t = host?.shadowRoot?.textContent ?? '';
    return /went wrong|try again|unavailable|high demand|error|failed/i.test(t)
      && !t.includes('Save to library');
  });

  // Reusable: re-select the same paragraph, trigger, and retry until DONE ("Save to library").
  // /api/v1/simplify can return 503 under Gemini load, so retry up to `tries` times.
  const reselect = () => wiki.evaluate(() => {
    const paras = document.querySelectorAll('.mw-parser-output > p');
    for (const p of paras) {
      if ((p.textContent?.trim().length ?? 0) > 60) {
        const range = document.createRange();
        range.selectNodeContents(p);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
    }
    return false;
  });
  const triggerUntilDone = async (label, tries = 6) => {
    for (let attempt = 1; attempt <= tries; attempt++) {
      console.log(`     ${label} attempt ${attempt}...`);
      await reselect();
      await delay(300);
      await triggerGistOn(wiki);
      await waitForPopover(wiki, 20000);
      if (await waitForShadowBtn(wiki, 'Save to library', 25000)) return true;
      console.log(`     ${label} attempt ${attempt}: not done (errored=${await popoverErrored()}) — retry in 8s`);
      await delay(8000);
    }
    return false;
  };

  // ── Initial gist: capture streaming, then done
  await triggerGistOn(wiki);
  await waitForPopover(wiki, 20000);
  await delay(1400);
  await screenshotPopover(wiki, 'popover-streaming.png');
  let reachedDone = await waitForShadowBtn(wiki, 'Save to library', 25000);
  if (!reachedDone) reachedDone = await triggerUntilDone('Gist');
  await delay(600);
  await screenshotPopover(wiki, 'popover-done.png');

  // ── Mermaid diagram — click Visualize (also can 503, retry up to 4×), then scroll diagram into view
  let diagramDone = false;
  for (let v = 1; v <= 4 && !diagramDone; v++) {
    await shadowClickAria(wiki, 'Visualize as diagram');
    await waitForShadowText(wiki, 'Drawing diagram', 8000);
    try {
      await wiki.waitForFunction(() => {
        const t = document.querySelector('#gist-shadow-host')?.shadowRoot?.textContent ?? '';
        return t.includes('Visual diagram') || t.includes('Diagram source');
      }, { timeout: 25000 });
      diagramDone = true;
    } catch {
      console.log(`     Visualize attempt ${v}: not drawn — retry in 6s`);
      await delay(6000);
    }
  }
  console.log(`     Diagram drawn: ${diagramDone}`);
  // The mermaid SVG is tall; scroll the diagram panel's TOP to the top of the
  // popover's scroll viewport so the diagram heading + first nodes are framed.
  await wiki.evaluate(() => {
    const sr = document.querySelector('#gist-shadow-host')?.shadowRoot;
    const panel = sr?.querySelector('[class*="diagramPanel"]');
    const scroller = sr?.querySelector('[class*="chatHistory"]');
    if (panel && scroller) {
      const pr = panel.getBoundingClientRect();
      const cr = scroller.getBoundingClientRect();
      scroller.scrollTop += (pr.top - cr.top) - 4; // align panel top just below viewport top
    }
  });
  await delay(900);
  await screenshotPopover(wiki, 'popover-mermaid.png');

  // ── Follow-up chat input — fill without submitting (state still DONE, input enabled)
  await wiki.evaluate(() => {
    const host = document.querySelector('#gist-shadow-host');
    if (!host?.shadowRoot) return;
    // scroll back to top so the input + conversation are framed nicely
    const body = host.shadowRoot.querySelector('[class*="popover"] [class*="body"], [class*="messages"]');
    if (body) body.scrollTop = body.scrollHeight;
    const input = host.shadowRoot.querySelector('input[type="text"], textarea');
    if (input) {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, 'Can you give a real-world example?');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await delay(400);
  await screenshotPopover(wiki, 'popover-chat.png');

  // ── ELI5 mode tab — click highlights it instantly (re-triggers a stream we don't wait on)
  await shadowClick(wiki, 'ELI5');
  await delay(1100);
  await screenshotPopover(wiki, 'popover-modes.png');

  // ── Nested (progressive disclosure): fresh standard gist → REAL double-click on a word.
  // The handler reads window.getSelection().toString(), so a synthetic event won't work —
  // we need an actual mouse double-click at the word's coordinates to select it natively.
  await triggerUntilDone('Nested-setup');
  await delay(800);
  let nestedDone = false;
  for (let n = 1; n <= 4 && !nestedDone; n++) {
    // Explicitly select a word and add it to the window selection, THEN dispatch
    // dblclick so the handler's window.getSelection().toString() returns the word.
    const word = await wiki.evaluate(() => {
      const host = document.querySelector('#gist-shadow-host');
      const md = host?.shadowRoot?.querySelector('[class*="markdown"]');
      if (!md) return null;
      const walker = document.createTreeWalker(md, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const m = /[A-Za-z]{6,}/.exec(node.textContent ?? '');
        if (m) {
          const range = document.createRange();
          range.setStart(node, m.index);
          range.setEnd(node, m.index + m[0].length);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          md.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true, cancelable: true, view: window }));
          return m[0];
        }
      }
      return null;
    });
    console.log(`     Nested attempt ${n}: drilled on "${word}"`);
    try {
      await wiki.waitForFunction(() => {
        return (document.querySelector('#gist-shadow-host')?.shadowRoot?.textContent ?? '').includes('›');
      }, { timeout: 15000 });
      nestedDone = true;
    } catch {
      console.log(`     Nested attempt ${n}: no breadcrumb — retry in 4s`);
      await delay(4000);
    }
  }
  console.log(`     Nested done: ${nestedDone}`);
  await delay(1500);
  await screenshotPopover(wiki, 'popover-nested.png');

  // ─────────────────────────────────────────────────────────────
  // CAPTURE OVERLAY
  // ─────────────────────────────────────────────────────────────
  console.log('\n📸  Capture overlay...');
  await wiki.keyboard.press('Escape');
  await delay(500);

  await sw.evaluate(async () => {
    const allTabs = await chrome.tabs.query({});
    const activeTabs = await chrome.tabs.query({ active: true });
    const tab = activeTabs[0] ?? allTabs.sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0];
    if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'GIST_CAPTURE_START', payload: {} });
  });
  await delay(1000);
  // Drag out a visible selection rectangle so the overlay is clearly shown
  await wiki.mouse.move(260, 200);
  await wiki.mouse.down();
  await wiki.mouse.move(820, 560, { steps: 20 });
  await delay(400);
  await screenshot(wiki, 'capture-overlay.png');
  await wiki.mouse.up();
  await delay(300);

  // ─────────────────────────────────────────────────────────────
  // AUTOGIST WIDGET
  // ─────────────────────────────────────────────────────────────
  console.log('\n📸  AutoGist widget...');
  await sw.evaluate(() => chrome.storage.local.set({ autoGistEnabled: true }));
  await delay(400);
  await wiki.reload({ waitUntil: 'domcontentloaded' });
  await delay(1500);
  // Dismiss any Wikipedia donation / email-reminder modal that may overlay the widget
  for (const label of [/Maybe later/i, /No thanks/i, /Close/i, /^×$/]) {
    try { await wiki.locator('a, button').filter({ hasText: label }).first().click({ timeout: 1500 }); await delay(300); } catch {}
  }
  await wiki.keyboard.press('Escape');
  await delay(300);

  // Scroll to trigger the IntersectionObserver → /autogist call
  await wiki.evaluate(() => window.scrollTo(0, 700));
  await delay(800);
  await wiki.evaluate(() => window.scrollTo(0, 1500));

  // Wait for the widget to reach "ready" state (takeaways rendered, not the idle hint)
  try {
    await wiki.waitForFunction(() => {
      const sr = document.querySelector('#gist-shadow-host')?.shadowRoot;
      const mount = sr?.querySelector('#gist-widget-mount');
      const txt = mount?.textContent ?? '';
      return txt.includes('AutoGist') && !txt.includes('Scroll to auto-summarize') && txt.replace('AutoGist', '').trim().length > 10;
    }, { timeout: 20000 });
    console.log('     AutoGist widget ready');
  } catch {
    console.log('     ⚠  AutoGist widget did not populate — capturing current state');
  }
  await delay(800);

  // The widget is "ghost UI" (opacity 0.2 at rest) — hover it to full opacity, then clip to it
  const wBox = await wiki.evaluate(() => {
    const sr = document.querySelector('#gist-shadow-host')?.shadowRoot;
    const w = sr?.querySelector('#gist-widget-mount [class*="widget"]');
    if (!w) return null;
    const r = w.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (wBox) {
    await wiki.mouse.move(wBox.x + wBox.width / 2, wBox.y + wBox.height / 2);
    await delay(600); // let the hover opacity transition (350ms) complete
    const pad = 26;
    const vp = wiki.viewportSize();
    const x = Math.max(0, wBox.x - pad), y = Math.max(0, wBox.y - pad);
    await wiki.screenshot({
      path: path.join(SS_DIR, 'autogist-widget.png'),
      clip: { x, y, width: Math.min(vp.width - x, wBox.width + pad * 2), height: Math.min(vp.height - y, wBox.height + pad * 2) },
    });
    console.log('  ✓  autogist-widget.png (clipped to widget)');
  } else {
    await screenshot(wiki, 'autogist-widget.png');
  }

  await wiki.close();
  console.log(`\n✅  All screenshots saved to:\n   ${SS_DIR}`);
  await ctx.close();
}

main().catch(err => {
  console.error('\n❌  Capture failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
