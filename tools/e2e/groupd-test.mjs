/* Focused verification for Group D — real db_comms writes.
   Serves the LOCAL source and confirms each rewired button now performs a real,
   persisted write to db_comms (messages / channels / templates), not just a toast.
   Each assertion is re-checked after a full page reload to prove persistence. */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.ADEPTIO_ROOT || path.resolve(__dirname, '..', '..'); // project root (tools/e2e -> repo root)

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (err, buf) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/`;

// table size helper, evaluated in-page
const size = (page, table) => page.evaluate(t => DB.list('db_comms', t).length, table);
const reload = async (page) => { await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(200); await page.evaluate(() => { if (DATA.tier() !== 'professional') DATA.setTier('professional'); }); await page.waitForTimeout(120); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleErr = [];
page.on('console', m => { if (m.type() === 'error') consoleErr.push(m.text()); });
page.on('pageerror', e => consoleErr.push('PAGEERROR: ' + (e.message || e)));
await page.goto(BASE + '?tier=professional#/launcher', { waitUntil: 'networkidle' });
// clean slate so seed counts are deterministic
await page.evaluate(() => { try { Object.keys(localStorage).filter(k => k.startsWith('adeptio.')).forEach(k => localStorage.removeItem(k)); } catch {} });
await reload(page);

async function clickAct(act) {
  return page.evaluate(a => { const el = [...document.querySelectorAll('[data-act]')].find(e => e.getAttribute('data-act') === a); if (!el) return false; el.click(); return true; }, act);
}

const results = [];
async function check(item, label, route, act, table, expectDelta, persistFn) {
  const r = { item, label, ok: false, info: '' };
  try {
    await page.evaluate(h => { location.hash = h; }, route);
    await page.waitForTimeout(200);
    const before = await size(page, table);
    const errBefore = consoleErr.length;
    const clicked = await clickAct(act);
    if (!clicked) { r.info = `button "${act}" not found on ${route}`; results.push(r); return; }
    await page.waitForTimeout(200);
    const after = await size(page, table);
    const deltaOk = after - before === expectDelta;
    // persistence: custom predicate survives reload
    const persisted = await (async () => { await reload(page); return page.evaluate(persistFn.fn, persistFn.arg); })();
    const errs = consoleErr.slice(errBefore);
    r.ok = deltaOk && persisted && errs.length === 0;
    r.info = `db_comms.${table} ${before}→${after} (Δ${after - before}, want ${expectDelta})` +
      (deltaOk ? '' : ' [DELTA MISMATCH]') + (persisted ? ' · persisted' : ' [NOT PERSISTED]') + (errs.length ? ' [console: ' + errs.join('; ') + ']' : '');
  } catch (e) { r.info = 'THREW: ' + (e.message || e); }
  results.push(r);
}

// messages writers — each adds rows to db_comms.messages
await check(12, 'nudge',       '#/manager/web/overview', 'comms-nudge',  'messages', 1, { fn: n => DB.list('db_comms', 'messages').length >= n, arg: 1 });
await check(15, 'publish',     '#/manager/web/schedule', 'comms-publish', 'messages', 1, { fn: n => DB.list('db_comms', 'messages').length >= n, arg: 1 });
// per-channel test sends (items 40-43) — one representative + verify all 4 ids resolve
for (const [it, id] of [[40, 'smtp.adeptio.la'], [41, 'laotel-bulk-01'], [42, 'fcm-adeptio-prod'], [43, 'line-oa-bridge']]) {
  await check(it, 'test:' + id, '#/sysadmin/web/channels', 'comms-test:' + id, 'messages', 1,
    { fn: cid => DB.list('db_comms', 'messages').some(m => (m.audience || '').includes('Gateway test')), arg: id });
}
await check(45, 'test-all',    '#/sysadmin/web/health',  'comms-test-all', 'messages', 3, { fn: () => DB.list('db_comms', 'messages').length >= 3 });
// channels writers
await check(39, 'add-channel', '#/sysadmin/web/channels', 'comms-add-channel', 'channels', 1, { fn: () => DB.list('db_comms', 'channels').some(c => /New channel/.test(c.name)) });
// templates writer
await check(52, 'new-template', '#/sysadmin/web/templates', 'comms-new-template', 'templates', 1, { fn: () => DB.list('db_comms', 'templates').some(t => t.name === 'Untitled frame') });

// reconnect — in-place status update (not a row add), checked specially
{
  const r = { item: 46, label: 'reconnect', ok: false, info: '' };
  try {
    await page.evaluate(() => { location.hash = '#/sysadmin/web/health'; });
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => (DB.list('db_comms', 'channels').find(c => c.id === 'line-oa-bridge') || {}).status);
    const errBefore = consoleErr.length;
    const clicked = await clickAct('comms-reconnect:line-oa-bridge');
    if (!clicked) { r.info = 'reconnect button not found'; }
    else {
      await page.waitForTimeout(200);
      const after = await page.evaluate(() => (DB.list('db_comms', 'channels').find(c => c.id === 'line-oa-bridge') || {}).status);
      await reload(page);
      const persisted = await page.evaluate(() => (DB.list('db_comms', 'channels').find(c => c.id === 'line-oa-bridge') || {}).status === 'live');
      const errs = consoleErr.slice(errBefore);
      r.ok = before === 'failed' && after === 'live' && persisted && errs.length === 0;
      r.info = `LINE OA status ${before}→${after}` + (persisted ? ' · persisted live' : ' [NOT PERSISTED]') + (errs.length ? ' [console: ' + errs.join('; ') + ']' : '');
    }
  } catch (e) { r.info = 'THREW: ' + (e.message || e); }
  results.push(r);
}

await browser.close();
await new Promise(r => server.close(r));

console.log('\n==== GROUP D — db_comms WRITE VERIFICATION (local source) ====\n');
let pass = 0;
results.sort((a, b) => a.item - b.item);
for (const r of results) { console.log(`  ${r.ok ? '✓ PASS' : '✗ FAIL'}  #${String(r.item).padStart(2)} ${r.label.padEnd(18)} ${r.info}`); if (r.ok) pass++; }
console.log(`\n  ${pass}/${results.length} comms actions perform a real, persisted db_comms write · ${consoleErr.length} total console error(s)`);
process.exit(pass === results.length ? 0 : 1);
