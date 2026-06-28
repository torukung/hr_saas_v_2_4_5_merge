/* Focused verification for Group E — honest "build-phase" deferrals.
   Serves the LOCAL source and confirms each of these buttons is now a greyed `.soon`
   affordance with a tooltip and an honest toast — and crucially writes NOTHING
   (no db_audit append, no store mutation) and throws no console error. Pro tier so all
   screens (sysadmin / ceo / vault) are reachable. */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.ADEPTIO_ROOT || path.resolve(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/' || p === '') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (err, buf) => { if (err) { res.writeHead(404); res.end('404'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});
await new Promise(r => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleErr = [];
page.on('console', m => { if (m.type() === 'error') consoleErr.push(m.text()); });
page.on('pageerror', e => consoleErr.push('PAGEERROR: ' + (e.message || e)));
await page.goto(BASE + '?tier=professional#/launcher', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

// item, label, route, data-act substring used to locate the button
const CASES = [
  [11, 'auto-approve',     '#/manager/web/approvals',          'Auto-approve routine'],
  [14, 'duplicate-week',   '#/manager/web/schedule',           'Duplicate week is a build-phase'],
  [27, 'holiday-calendar', '#/hr/web/leave',                   'Holiday calendar is a build-phase'],
  [31, 'edit-person',      '#/hr/web/person/EMP-0214',         'Edit mode is a build-phase'],
  [37, 'ceo-request',      '#/ceo/web/packs',                  'Delivery schedule is owned by HR'],
  [44, 'fallback-editor',  '#/sysadmin/web/channels',          'Fallback editor is a build-phase'],
  [47, 'integration',      '#/sysadmin/web/integrations',      'Integration catalog is a build-phase'],
  [50, 'lao-variant',      '#/sysadmin/web/template/TPL-023',  'ລາວ variant opens side-by-side'],
  ['S2', 'lang-toggle',    '#/staff/web/home',                 'lang-lo'],
];

const results = [];
for (const [item, label, route, needle] of CASES) {
  const r = { item, label, ok: false, info: '' };
  try {
    await page.evaluate(h => { location.hash = h; }, route);
    await page.waitForTimeout(200);
    const probe = await page.evaluate(n => {
      const el = [...document.querySelectorAll('[data-act]')].find(e => e.getAttribute('data-act').includes(n));
      if (!el) return { found: false };
      return { found: true, soon: el.className.includes('soon'), title: el.getAttribute('title') || '' };
    }, needle);
    if (!probe.found) { r.info = `button containing "${needle}" not found on ${route}`; results.push(r); continue; }
    const auditBefore = await page.evaluate(() => DB.list('db_audit', 'events').length);
    const errBefore = consoleErr.length;
    await page.evaluate(n => [...document.querySelectorAll('[data-act]')].find(e => e.getAttribute('data-act').includes(n)).click(), needle);
    await page.waitForTimeout(150);
    const auditAfter = await page.evaluate(() => DB.list('db_audit', 'events').length);
    const toastShown = await page.evaluate(() => !!document.querySelector('.toast'));
    const errs = consoleErr.slice(errBefore);
    const inert = auditAfter === auditBefore;        // wrote nothing to the ledger
    r.ok = probe.soon && probe.title.length > 0 && toastShown && inert && errs.length === 0;
    r.info = `soon=${probe.soon} title="${probe.title.slice(0, 28)}…" toast=${toastShown} ledgerΔ=${auditAfter - auditBefore}` +
      (probe.soon ? '' : ' [NOT GREYED]') + (probe.title ? '' : ' [NO TOOLTIP]') + (inert ? '' : ' [WROTE TO LEDGER!]') + (errs.length ? ' [console: ' + errs.join('; ') + ']' : '');
  } catch (e) { r.info = 'THREW: ' + (e.message || e); }
  results.push(r);
}

await browser.close();
await new Promise(r => server.close(r));

console.log('\n==== GROUP E — HONEST BUILD-PHASE DEFERRALS (local source) ====\n');
let pass = 0;
for (const r of results) { console.log(`  ${r.ok ? '✓ PASS' : '✗ FAIL'}  #${String(r.item).padStart(2)} ${r.label.padEnd(18)} ${r.info}`); if (r.ok) pass++; }
console.log(`\n  ${pass}/${results.length} buttons are greyed + tooltipped + honest + inert (no ledger write) · ${consoleErr.length} total console error(s)`);
process.exit(pass === results.length ? 0 : 1);
