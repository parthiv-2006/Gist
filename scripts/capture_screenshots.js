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

  // ─────────────────────────────────────────────────────────────
  // ONBOARDING
  // ─────────────────────────────────────────────────────────────
  console.log('📸  Onboarding flow...');
  const ob = await ctx.newPage();
  await ob.setViewportSize({ width: 1440, height: 900 });
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
  await dash.setViewportSize({ width: 1440, height: 900 });
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

  // Trigger and wait for popover to mount
  await triggerGistOn(wiki);
  const appeared = await waitForPopover(wiki, 20000);
  console.log(`     Popover appeared: ${appeared}`);

  // ── Streaming state
  await delay(1500);
  await screenshot(wiki, 'popover-streaming.png');

  // ── Done state (wait for Save button text in shadow DOM)
  await waitForShadowText(wiki, 'Save', 28000);
  await delay(400);
  await screenshot(wiki, 'popover-done.png');

  // ── ELI5 mode tab
  await shadowClick(wiki, 'ELI5');
  await delay(500);
  await screenshot(wiki, 'popover-modes.png');

  // ── Follow-up chat input — fill without submitting
  await wiki.evaluate(() => {
    const host = document.querySelector('#gist-shadow-host');
    if (!host?.shadowRoot) return;
    const input = host.shadowRoot.querySelector('input[type="text"], textarea');
    if (input) {
      input.focus();
      // React synthetic events need nativeInputValueSetter
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, 'Can you give a real-world example?');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await delay(400);
  await screenshot(wiki, 'popover-chat.png');

  // ── Mermaid diagram
  await shadowClick(wiki, /diagram|visual|map/i);
  await delay(7000);
  await screenshot(wiki, 'popover-mermaid.png');

  // ── Nested — double-click a word in rendered explanation text
  await wiki.evaluate(() => {
    const host = document.querySelector('#gist-shadow-host');
    if (!host?.shadowRoot) return;
    const paras = [...host.shadowRoot.querySelectorAll('p, [class*="text"], [class*="content"]')]
      .filter(el => el.children.length === 0 && (el.textContent?.trim().length ?? 0) > 20);
    if (paras[0]) {
      paras[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    }
  });
  await delay(3000);
  await screenshot(wiki, 'popover-nested.png');

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
  await delay(1200);
  await screenshot(wiki, 'capture-overlay.png');
  await wiki.keyboard.press('Escape');
  await delay(300);

  // ─────────────────────────────────────────────────────────────
  // AUTOGIST WIDGET
  // ─────────────────────────────────────────────────────────────
  console.log('\n📸  AutoGist widget...');
  await sw.evaluate(() => chrome.storage.local.set({ autoGistEnabled: true }));
  await delay(400);
  await wiki.reload({ waitUntil: 'domcontentloaded' });
  await delay(1500);
  // Dismiss donation banner after reload
  try {
    await wiki.locator('a, button').filter({ hasText: /Maybe later|No thanks/i }).first().click({ timeout: 3000 });
    await delay(400);
  } catch {}
  // Scroll to trigger IntersectionObserver
  await wiki.evaluate(() => window.scrollTo(0, 700));
  await delay(700);
  await wiki.evaluate(() => window.scrollTo(0, 1500));
  await delay(7000);
  await screenshot(wiki, 'autogist-widget.png');

  await wiki.close();
  console.log(`\n✅  All screenshots saved to:\n   ${SS_DIR}`);
  await ctx.close();
}

main().catch(err => {
  console.error('\n❌  Capture failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
