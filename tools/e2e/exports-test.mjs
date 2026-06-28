/* Focused verification for Group A — real file exports.
   Serves the LOCAL modified source and confirms each of the 10 rewired
   buttons now triggers a real, non-empty file download (not just a toast). */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.ADEPTIO_ROOT || path.resolve(__dirname, '..', '..'); // project root (tools/e2e -> repo root)
const DL = path.join(__dirname, 'downloads');
fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const file = path.join(ROOT, p);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;
const BASE = `http://localhost:${PORT}/`;

const CASES = [
  { item: 6, label: 'mydata',     route: '#/staff/web/mydata',                 act: 'export:mydata',     file: 'adeptio-mydata' },
  { item: 7, label: 'tax',        route: '#/staff/web/payslip/PS-2026-05',     act: 'export:tax',        file: 'adeptio-tax-statement' },
  { item: 8, label: 'payslip',    route: '#/staff/web/payslips',               act: 'export:payslip',    file: 'adeptio-payslips' },
  { item: 9, label: 'reqhistory', route: '#/staff/web/request-detail/LV-0481', act: 'export:reqhistory', file: 'adeptio-requests' },
  { item: 16, label: 'teamreport', route: '#/manager/web/team',                act: 'export:teamreport', file: 'adeptio-team' },
  { item: 17, label: 'teamslice', route: '#/manager/web/teamdata',             act: 'export:teamslice',  file: 'adeptio-team' },
  { item: 28, label: 'variance',  route: '#/hr/web/payroll-run/PR-2026-06',    act: 'export:variance',   file: 'adeptio-payroll-variance' },
  { item: 29, label: 'orgchart',  route: '#/hr/web/people',                    act: 'export:orgchart',   file: 'adeptio-org-chart' },
  { item: 32, label: 'exceptions', route: '#/hr/web/time',                     act: 'export:exceptions', file: 'adeptio-attendance-exceptions' },
  { item: 36, label: 'boardpack', route: '#/ceo/web/board',                    act: 'export:boardpack',  file: 'adeptio-board-pack' },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const consoleErr = [];
page.on('console', m => { if (m.type() === 'error') consoleErr.push(m.text()); });
page.on('pageerror', e => consoleErr.push('PAGEERROR: ' + (e.message || e)));
await page.goto(BASE + '?tier=professional#/launcher', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

const results = [];
for (const c of CASES) {
  const r = { item: c.item, label: c.label, route: c.route, ok: false, info: '' };
  try {
    await page.evaluate(h => { location.hash = h; }, c.route);
    await page.waitForTimeout(200);
    const found = await page.evaluate(a => !![...document.querySelectorAll('[data-act]')].find(e => e.getAttribute('data-act') === a), c.act);
    if (!found) { r.info = 'button ' + c.act + ' not present on ' + c.route; results.push(r); continue; }
    const errBefore = consoleErr.length;
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
      page.evaluate(a => [...document.querySelectorAll('[data-act]')].find(e => e.getAttribute('data-act') === a).click(), c.act)
    ]);
    if (!dl) { r.info = 'no download event fired'; results.push(r); continue; }
    const name = dl.suggestedFilename();
    const out = path.join(DL, name);
    await dl.saveAs(out);
    const buf = fs.readFileSync(out, 'utf8');
    const lines = buf.split('\n').filter(Boolean);
    const errs = consoleErr.slice(errBefore);
    const nameOk = name.startsWith(c.file);
    const contentOk = buf.length > 0 && (name.endsWith('.json') ? buf.trim().startsWith('{') : lines.length >= 1);
    r.ok = nameOk && contentOk && errs.length === 0;
    r.info = `file="${name}" bytes=${buf.length} ${name.endsWith('.csv') ? 'rows=' + (lines.length - 1) : 'json'}` +
      (nameOk ? '' : ' [NAME MISMATCH]') + (contentOk ? '' : ' [EMPTY/BAD]') + (errs.length ? ' [console: ' + errs.join('; ') + ']' : '');
  } catch (e) { r.info = 'THREW: ' + (e.message || e); }
  results.push(r);
}
await browser.close();
await new Promise(r => server.close(r));

console.log('\n==== GROUP A — EXPORT VERIFICATION (local modified source) ====\n');
let pass = 0;
for (const r of results) { console.log(`  ${r.ok ? '✓ PASS' : '✗ FAIL'}  #${String(r.item).padStart(2)} ${r.label.padEnd(11)} ${r.info}`); if (r.ok) pass++; }
console.log(`\n  ${pass}/${results.length} exports produce a real file · downloads saved to ${path.relative(process.cwd(), DL)}/`);
process.exit(pass === results.length ? 0 : 1);
