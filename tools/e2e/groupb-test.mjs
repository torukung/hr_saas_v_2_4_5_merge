/* Focused verification for Group B — document generation + template lifecycle.
   Serves the LOCAL source and confirms each rewired button now performs a real,
   persisted write: db_docs.documents rows (generated documents) or db_comms.templates
   status updates (publish / preview). Runs on Professional tier so the vault (db_docs)
   is provisioned and sysadmin is unlocked. Each write is re-checked after a full reload. */
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

const docCount = (page) => page.evaluate(() => DB.list('db_docs', 'documents').length);
const reload = async (page) => { await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(200); await page.evaluate(() => { if (DATA.tier() !== 'professional') DATA.setTier('professional'); }); await page.waitForTimeout(120); };
async function clickAct(page, act) { return page.evaluate(a => { const el = [...document.querySelectorAll('[data-act]')].find(e => e.getAttribute('data-act') === a); if (!el) return false; el.click(); return true; }, act); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleErr = [];
page.on('console', m => { if (m.type() === 'error') consoleErr.push(m.text()); });
page.on('pageerror', e => consoleErr.push('PAGEERROR: ' + (e.message || e)));
await page.goto(BASE + '?tier=professional#/launcher', { waitUntil: 'networkidle' });
await page.evaluate(() => { try { Object.keys(localStorage).filter(k => k.startsWith('adeptio.')).forEach(k => localStorage.removeItem(k)); } catch {} });
await reload(page);

const results = [];

// --- db_docs document-generation buttons ---
async function checkDoc(item, label, route, act, expectDelta) {
  const r = { item, label, ok: false, info: '' };
  try {
    await page.evaluate(h => { location.hash = h; }, route);
    await page.waitForTimeout(200);
    const before = await docCount(page);
    const errBefore = consoleErr.length;
    if (!await clickAct(page, act)) { r.info = `button "${act}" not found on ${route}`; results.push(r); return; }
    await page.waitForTimeout(250);
    const after = await docCount(page);
    const deltaOk = after - before === expectDelta;
    await reload(page);
    const persisted = await docCount(page) === after;
    const errs = consoleErr.slice(errBefore);
    r.ok = deltaOk && persisted && errs.length === 0;
    r.info = `db_docs ${before}→${after} (Δ${after - before}, want ${expectDelta})` + (deltaOk ? '' : ' [DELTA]') + (persisted ? ' · persisted' : ' [NOT PERSISTED]') + (errs.length ? ' [console: ' + errs.join('; ') + ']' : '');
  } catch (e) { r.info = 'THREW: ' + (e.message || e); }
  results.push(r);
}

await checkDoc(2, 'staff-salary',        '#/staff/web/documents',        'gen-doc:staff-salary', 1);
await checkDoc(3, 'staff-employment',    '#/staff/web/documents',        'gen-doc:staff-employment', 1);
await checkDoc(4, 'staff-attendance',    '#/staff/web/documents',        'gen-doc:staff-attendance', 1);
await checkDoc(23, 'hr-salary (web)',    '#/hr/web/approvals',           'gen-doc:hr-salary-manysone', 1);
await checkDoc(19, 'hr-salary (mobile)', '#/hr/mobile/queue',            'gen-doc:hr-salary-manysone', 1);
await checkDoc(24, 'hr-employment',      '#/hr/web/docs',                'gen-doc:hr-employment-letter', 1);
await checkDoc(25, 'hr-bulk-finance',    '#/hr/web/docs',                'gen-doc:hr-bulk-salary-finance', 3);
await checkDoc(26, 'hr-contract-renew',  '#/hr/web/docs',                'gen-doc:hr-contract-renewals', 3);
await checkDoc(30, 'hr-person-letter',   '#/hr/web/person/EMP-0214',     'gen-doc:hr-person-letter', 1);

// --- template lifecycle (db_comms.templates) ---
async function checkTpl(item, label, route, act, tpl, predicate) {
  const r = { item, label, ok: false, info: '' };
  try {
    await page.evaluate(h => { location.hash = h; }, route);
    await page.waitForTimeout(200);
    const errBefore = consoleErr.length;
    if (!await clickAct(page, act)) { r.info = `button "${act}" not found on ${route}`; results.push(r); return; }
    await page.waitForTimeout(200);
    await reload(page);
    const persisted = await page.evaluate(([id, pred]) => { const t = DB.list('db_comms', 'templates').find(x => x.id === id); return t ? eval(pred)(t) : false; }, [tpl, predicate]);
    const errs = consoleErr.slice(errBefore);
    r.ok = persisted && errs.length === 0;
    r.info = `${tpl} ${label}` + (persisted ? ' · persisted' : ' [NOT PERSISTED]') + (errs.length ? ' [console: ' + errs.join('; ') + ']' : '');
  } catch (e) { r.info = 'THREW: ' + (e.message || e); }
  results.push(r);
}
// preview first (keeps TPL-023 in review), then publish TPL-023 (web), then publish TPL-026 (mobile)
await checkTpl(49, 'preview',        '#/sysadmin/web/template/TPL-023',    'comms-preview-template:TPL-023', 'TPL-023', 't => !!t.lastPreview');
await checkTpl(51, 'publish (web)',  '#/sysadmin/web/template/TPL-023',    'comms-publish-template:TPL-023', 'TPL-023', 't => t.status === "published"');
await checkTpl(38, 'publish (mobile)', '#/sysadmin/mobile/template/TPL-026', 'comms-publish-template:TPL-026', 'TPL-026', 't => t.status === "published"');
// clone — only renders on an already-published template (TPL-014 is published in seed) → adds a new custom draft
{
  const r = { item: '14c', label: 'clone (published)', ok: false, info: '' };
  try {
    await page.evaluate(() => { location.hash = '#/sysadmin/web/template/TPL-014'; });
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => DB.list('db_comms', 'templates').length);
    const errBefore = consoleErr.length;
    const clicked = await clickAct(page, 'comms-clone-template:TPL-014');
    if (!clicked) { r.info = 'clone button not found on published TPL-014'; }
    else {
      await page.waitForTimeout(200); await reload(page);
      const persisted = await page.evaluate(n => DB.list('db_comms', 'templates').length === n + 1 && DB.list('db_comms', 'templates').some(t => /\(custom\)/.test(t.name)), before);
      const errs = consoleErr.slice(errBefore);
      r.ok = persisted && errs.length === 0;
      r.info = `templates +custom draft` + (persisted ? ' · persisted' : ' [NOT PERSISTED]') + (errs.length ? ' [console: ' + errs.join('; ') + ']' : '');
    }
  } catch (e) { r.info = 'THREW: ' + (e.message || e); }
  results.push(r);
}

await browser.close();
await new Promise(r => server.close(r));

console.log('\n==== GROUP B — DOCUMENT GENERATION + TEMPLATE LIFECYCLE (local source) ====\n');
let pass = 0; results.sort((a, b) => a.item - b.item);
for (const r of results) { console.log(`  ${r.ok ? '✓ PASS' : '✗ FAIL'}  #${String(r.item).padStart(2)} ${r.label.padEnd(20)} ${r.info}`); if (r.ok) pass++; }
console.log(`\n  ${pass}/${results.length} actions perform a real, persisted write · ${consoleErr.length} total console error(s)`);
process.exit(pass === results.length ? 0 : 1);
