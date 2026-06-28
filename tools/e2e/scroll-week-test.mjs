/* tools/e2e/scroll-week-test.mjs — v2.4.4 scroll-preservation proof
   ------------------------------------------------------------------
   Proves the v2.4.4 fine-tune in app.js:render(): opening/switching an inline
   week on the month calendar (.cal-wk[data-sched-week]) is a SOFT re-render that
   swaps only .workspace-inner and leaves the WINDOW scroll position untouched
   (no jump to top) — while a real navigation still resets scroll to 0.

   Engine: REAL Google Chrome via Playwright channel:'chrome' (system browser).
   We need a real layout engine here — jsdom has no layout and scrollTop/scrollY
   are inert stubs, so it could never actually prove scroll is preserved.

   Self-contained: serves the v2.4.4 folder over a built-in Node http server
   (zero extra deps) and drives it. Run:  node scroll-week-test.mjs
*/
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// repo root = two dirs up from tools/e2e/
const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..', '..'));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.map': 'application/json', '.woff2': 'font/woff2' };

const ok = (m) => console.log('  ✓ ' + m);
const fail = (m) => { console.log('  ✗ ' + m); failed.push(m); };
const failed = [];

// ---------- zero-dependency static server ----------
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
    if (p === '/' || p === '') p = '/index.html';
    const fp = normalize(join(ROOT, p));
    if (fp !== ROOT && !fp.startsWith(ROOT + sep)) { res.writeHead(403).end('forbidden'); return; }
    const body = await readFile(fp);
    res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
console.log('serving', ROOT);
console.log('base   ', BASE);

const goHash = async (page, hash) => {
  await page.evaluate(h => { window.location.hash = h; }, hash);
  await page.waitForTimeout(150); // hashchange → synchronous render + CSS settle
};

let browser;
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' }); // system Google Chrome
  // short viewport so the month page overflows and the window is actually scrollable
  const page = await browser.newPage({ viewport: { width: 1280, height: 560 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + (e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  // 1) boot + drop the auth portal so direct screen routes render (same lever the app exposes)
  await page.goto(BASE + '#/launcher', { waitUntil: 'load' });
  await page.waitForFunction(() => window.PERSONAS && window.AUTH && window.DATA, null, { timeout: 10000 });
  await page.evaluate(() => { AUTH.setPortal(false, 'scroll-test'); });
  ok('app booted, auth_portal disabled');

  // 2) open the HR month calendar — it carries the week rail (.cal-wk[data-sched-week])
  await goHash(page, '#/hr/web/sched-cal/month');
  const probe = await page.evaluate(() => ({
    rails: document.querySelectorAll('.cal-wk[data-sched-week]').length,
    maxScroll: document.documentElement.scrollHeight - window.innerHeight,
    hash: location.hash,
  }));
  if (probe.rails > 0) ok(`month calendar rendered with ${probe.rails} week rails`);
  else fail(`no .cal-wk[data-sched-week] rails on ${probe.hash} (rails=${probe.rails})`);
  if (probe.maxScroll >= 30) ok(`page is scrollable (maxScroll=${probe.maxScroll}px)`);
  else fail(`page not meaningfully scrollable (maxScroll=${probe.maxScroll}px) — assertion would be vacuous`);

  // 3) THE PROOF — scroll down, click a week rail, assert scroll is preserved.
  //    We click the BOTTOM-most rail so its inline expansion lands below the
  //    viewport anchor — that removes Chrome's scroll-anchoring compensation
  //    (which otherwise nudges scrollY a few px when content grows ABOVE the
  //    fold). The app never touches scroll on a week-toggle: render() swaps only
  //    .workspace-inner and early-returns, so a preserved scroll is the proof.
  //    Tolerance (TOL) is wide enough to ignore sub-pixel/anchoring noise yet far
  //    below a real jump-to-top (~the full scroll distance), which the control hits.
  const TOL = 16;
  const beforeY = await page.evaluate(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.floor(max * 0.6));
    return Math.round(window.scrollY);
  });
  ok(`scrolled window to y=${beforeY}`);
  // programmatic .click() → fires the delegated document handler WITHOUT Playwright
  // auto-scrolling the element into view (which would itself move the window).
  const clicked = await page.evaluate(() => {
    const rails = [...document.querySelectorAll('.cal-wk[data-sched-week]')];
    if (!rails.length) return null;
    const vh = window.innerHeight;
    // lowest rail still at/above the fold (largest top < vh); else the last rail
    const inView = rails.filter(r => { const t = r.getBoundingClientRect().top; return t >= 0 && t < vh; });
    const pick = (inView.length ? inView : rails).reduce((a, b) =>
      b.getBoundingClientRect().top > a.getBoundingClientRect().top ? b : a);
    const wk = pick.getAttribute('data-sched-week');
    pick.click();
    return wk;
  });
  await page.waitForTimeout(180);
  const after = await page.evaluate(() => ({
    y: Math.round(window.scrollY),
    hash: location.hash,
    open: document.querySelectorAll('.cal-weekrow.open, .cal-weekexpand').length,
  }));
  if (clicked) ok(`clicked bottom week rail ${clicked}`);
  else fail('could not find a week rail to click');

  const drift = Math.abs(after.y - beforeY);
  if (drift <= TOL) ok(`SCROLL PRESERVED across week-click — before=${beforeY} after=${after.y} (drift ${drift}px ≤ ${TOL})`);
  else fail(`scroll jumped on week-click — before=${beforeY} after=${after.y} (drift ${drift}px > ${TOL})`);

  if (/sched-cal\/month\.\d{4}-\d\d-\d\d/.test(after.hash)) ok(`route carries the open week: ${after.hash.replace(/^#\//, '')}`);
  else fail(`route did not record the open week: ${after.hash}`);
  if (after.open > 0) ok('the clicked week expanded in place');
  else fail('no .cal-weekrow.open / .cal-weekexpand after click');

  // 4) CONTROL — a real navigation (perspective month→week) must RESET scroll to 0,
  //    proving the test discriminates "preserve" from ordinary navigation.
  await page.evaluate(() => window.scrollTo(0, Math.floor((document.documentElement.scrollHeight - window.innerHeight) * 0.6)));
  const ctrlBefore = await page.evaluate(() => Math.round(window.scrollY));
  await goHash(page, '#/hr/web/sched-cal/week.2026-06-08');
  const ctrlAfter = await page.evaluate(() => Math.round(window.scrollY));
  if (ctrlBefore > 5 && ctrlAfter === 0) ok(`control: real navigation reset scroll (${ctrlBefore} → 0)`);
  else fail(`control did not behave as expected (before=${ctrlBefore} after=${ctrlAfter})`);

  if (errs.length) fail(`console/page errors: ${errs.slice(0, 3).join(' | ')}`);
  else ok('no console / page errors');

  await browser.close();
} catch (e) {
  console.error('\nharness error:', e && (e.stack || e.message || e));
  failed.push('harness: ' + (e && (e.message || e)));
  if (browser) await browser.close().catch(() => {});
} finally {
  server.close();
}

console.log('\n' + (failed.length ? `FAIL — ${failed.length} check(s) failed` : 'PASS — all checks green'));
process.exit(failed.length ? 1 : 0);
