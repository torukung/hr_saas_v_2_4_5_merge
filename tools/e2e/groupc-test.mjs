/* Focused verification for Group C — workflow state-changes.
   Serves the LOCAL source and confirms each rewired button performs a real, persisted
   state change: db_workflow request updates, a db_docs acknowledgement, db_audit ledger
   facts, and a db_comms reminder. Runs on Professional tier (db_docs vault provisioned,
   sysadmin/delegation unlocked). Each change is re-checked after a full page reload. */
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

const reload = async (page) => { await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(200); await page.evaluate(() => { if (DATA.tier() !== 'professional') DATA.setTier('professional'); }); await page.waitForTimeout(120); };
const clickAct = (page, act) => page.evaluate(a => { const el = [...document.querySelectorAll('[data-act]')].find(e => e.getAttribute('data-act') === a); if (!el) return false; el.click(); return true; }, act);

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
// generic: navigate, click, reload, assert predicate (a function-source string evaluated in-page)
async function check(item, label, route, act, predicateSrc, note) {
  const r = { item, label, ok: false, info: note || '' };
  try {
    await page.evaluate(h => { location.hash = h; }, route);
    await page.waitForTimeout(200);
    const errBefore = consoleErr.length;
    if (!await clickAct(page, act)) { r.info = `button "${act}" not found on ${route}`; results.push(r); return; }
    await page.waitForTimeout(200);
    await reload(page);
    const persisted = await page.evaluate(src => eval(src)(), predicateSrc);
    const errs = consoleErr.slice(errBefore);
    r.ok = persisted && errs.length === 0;
    r.info = (note ? note + ' · ' : '') + (persisted ? 'persisted' : 'NOT PERSISTED') + (errs.length ? ' [console: ' + errs.join('; ') + ']' : '');
  } catch (e) { r.info = 'THREW: ' + (e.message || e); }
  results.push(r);
}

// db_workflow — item 5 must run before item 22 (creates the Profile request it approves)
await check(5, 'profile-request', '#/staff/web/me', 'wf-profile-request',
  `() => DB.list('db_workflow','requests').some(r => r.type === 'Profile')`, 'db_workflow +Profile request');
await check(1, 'ack-policy', '#/staff/web/documents', 'wf-ack-policy',
  `() => { const d = DB.list('db_docs','documents').find(x => /conduct/i.test(x.name)); return d && d.status === 'acknowledged'; }`, 'db_docs policy → acknowledged');
await check(10, 'delegate', '#/manager/web/approval/LV-0481', 'wf-delegate',
  `() => { const r = DB.list('db_workflow','requests').find(x => x.id === 'LV-0481'); return r && /Delegated/.test(r.note || ''); }`, 'db_workflow LV-0481 note');
await check(13, 'coaching', '#/manager/web/overview', 'wf-coaching',
  `() => DB.list('db_audit','events').some(e => e.act === 'coaching.note_recorded')`, 'db_audit fact');
await check(20, 'route-finance', '#/hr/web/approval/EX-0210', 'wf-route-finance',
  `() => { const r = DB.list('db_workflow','requests').find(x => x.id === 'EX-0210'); return r && r.stage === 'Finance export'; }`, 'db_workflow EX-0210 stage');
await check(21, 'ledger-adjust', '#/hr/web/approvals', 'wf-ledger-adjust',
  `() => DB.list('db_audit','events').some(e => e.act === 'payroll.ledger_adjusted')`, 'db_audit fact');
await check(22, 'profile-approve', '#/hr/web/approvals', 'wf-profile-approve',
  `() => DB.list('db_workflow','requests').some(r => r.type === 'Profile' && r.status === 'approved')`, 'db_workflow Profile → approved');
await check(33, 'pv-escalate', '#/hr/web/time', 'wf-pv-escalate',
  `() => DB.list('db_audit','events').some(e => e.act === 'pv.escalated')`, 'db_audit fact');
await check(34, 'note-monitor', '#/hr/web/time', 'wf-note-monitor',
  `() => DB.list('db_audit','events').some(e => e.act === 'attendance.flag_noted')`, 'db_audit fact');
await check(35, 'correction-reminders', '#/hr/web/time', 'wf-correction-reminders',
  `() => DB.list('db_comms','messages').some(m => /Time-correction/.test(m.audience || ''))`, 'db_comms +message');
await check(48, 'role-approve', '#/sysadmin/web/roles', 'wf-role-approve',
  `() => DB.list('db_audit','events').some(e => e.act === 'role.request_approved')`, 'db_audit fact');

await browser.close();
await new Promise(r => server.close(r));

console.log('\n==== GROUP C — WORKFLOW STATE-CHANGES (local source) ====\n');
let pass = 0; results.sort((a, b) => a.item - b.item);
for (const r of results) { console.log(`  ${r.ok ? '✓ PASS' : '✗ FAIL'}  #${String(r.item).padStart(2)} ${r.label.padEnd(20)} ${r.info}`); if (r.ok) pass++; }
console.log(`\n  ${pass}/${results.length} actions perform a real, persisted state change · ${consoleErr.length} total console error(s)`);
process.exit(pass === results.length ? 0 : 1);
