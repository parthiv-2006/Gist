/** Focused capture for the AutoGist ghost widget (opacity 0.2 at rest → hover to reveal). */
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

const DIST_PATH = path.resolve(__dirname, '../gist-extension/dist');
const SS_DIR = path.resolve(__dirname, '../.github/assets/screenshots');
const USER_DATA = path.join(os.tmpdir(), 'gist-pw-autogist');
const delay = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  if (fs.existsSync(USER_DATA)) fs.rmSync(USER_DATA, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    headless: false,
    args: [`--disable-extensions-except=${DIST_PATH}`, `--load-extension=${DIST_PATH}`, '--window-size=1440,900'],
    viewport: { width: 1440, height: 900 },
  });
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  await delay(1500);

  await sw.evaluate(() => chrome.storage.local.set({ autoGistEnabled: true }));
  const wiki = await ctx.newPage();
  await wiki.goto('https://en.wikipedia.org/wiki/Artificial_intelligence', { waitUntil: 'domcontentloaded' });
  await delay(1800);
  for (const label of [/Maybe later/i, /No thanks/i, /Close/i, /^×$/]) {
    try { await wiki.locator('a, button').filter({ hasText: label }).first().click({ timeout: 1500 }); await delay(300); } catch {}
  }
  await wiki.keyboard.press('Escape'); await delay(300);

  await wiki.evaluate(() => window.scrollTo(0, 700)); await delay(800);
  await wiki.evaluate(() => window.scrollTo(0, 1500));

  try {
    await wiki.waitForFunction(() => {
      const sr = document.querySelector('#gist-shadow-host')?.shadowRoot;
      const txt = sr?.querySelector('#gist-widget-mount')?.textContent ?? '';
      return txt.includes('AutoGist') && !txt.includes('Scroll to auto-summarize') && txt.replace('AutoGist', '').trim().length > 10;
    }, { timeout: 20000 });
    console.log('AutoGist ready');
  } catch { console.log('AutoGist did not populate'); }
  await delay(800);

  const wBox = await wiki.evaluate(() => {
    const w = document.querySelector('#gist-shadow-host')?.shadowRoot?.querySelector('#gist-widget-mount [class*="widget"]');
    if (!w) return null;
    const r = w.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (!wBox) { console.error('widget not found'); await ctx.close(); process.exit(1); }

  await wiki.mouse.move(wBox.x + wBox.width / 2, wBox.y + wBox.height / 2);
  await delay(700);
  const pad = 26, vp = wiki.viewportSize();
  const x = Math.max(0, wBox.x - pad), y = Math.max(0, wBox.y - pad);
  await wiki.screenshot({
    path: path.join(SS_DIR, 'autogist-widget.png'),
    clip: { x, y, width: Math.min(vp.width - x, wBox.width + pad * 2), height: Math.min(vp.height - y, wBox.height + pad * 2) },
  });
  console.log('Saved autogist-widget.png');
  await ctx.close();
})();
