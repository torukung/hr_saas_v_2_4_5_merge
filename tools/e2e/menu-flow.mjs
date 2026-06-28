/* ============================================================
   ADEPTIO Adaptive HR — Platform UI v2.4.5 (Single Platform · Single Tenant)
   END-TO-END MENU FLOW CHECK  (Playwright · real Chromium)

   Purpose-built for v2.4.5. Unlike the legacy tools/e2e/e2e.mjs (which
   predates the auth portal and points at the old deployed site), this:
     • serves the LOCAL working tree on a built-in static server (no deps)
     • disables auth_portal so the menu rail is reachable without a session
     • turns licensing OFF (everything unlocked) + tier = professional
     • enables EVERY feature flag so flag-hidden menus are also exercised
     • walks the LIVE nav rail (web) + tab bar (mobile) for all 5 personas,
       navigating to each item and classifying the result:
         OK · DEAD-MENU(no builder/redirect) · ERROR(console/page) ·
         THIN(empty render) · TOKEN-LEAK · BROKEN-LINK · DEAD-BUTTON · STUB

   Run:    node tools/e2e/menu-flow.mjs
   Output: tools/e2e/menu-flow-results.json
           tools/e2e/menu-flow-report.html   (interactive triage report)
           tools/e2e/screenshots-menu/<id>.png  (one per failing menu)
   ============================================================ */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');           // project root (index.html lives here)
const SHOTS = path.join(__dirname, 'screenshots-menu');
const PORT = Number(process.env.PORT || 8851);
const BASE = `http://127.0.0.1:${PORT}/`;

fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });

const PERSONAS = ['staff', 'manager', 'hr', 'ceo', 'sysadmin'];
const BAD_TOKENS = ['undefined', 'NaN', '[object Object]', 'null'];

/* ---------- tiny zero-dep static server ---------- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.map': 'application/json' };
function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
      if (p === '/' || p === '') p = '/index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

const results = {
  app: 'Adeptio Adaptive HR v2.4.5 — Single Platform · Single Tenant',
  base: BASE, startedAt: new Date().toISOString(),
  config: { portal: 'disabled', licensing: 'off (all unlocked)', tier: 'professional', flags: 'all enabled' },
  personas: {}, menus: [], deadButtons: [], stubActions: [], findings: []
};
let shotN = 0;
async function shot(page, label) {
  const name = `${String(++shotN).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '_').slice(0, 70)}.png`;
  try { await page.screenshot({ path: path.join(SHOTS, name), fullPage: true }); } catch { /* detached */ }
  return name;
}
function finding(severity, area, title, detail, shotName) {
  results.findings.push({ severity, area, title, detail: detail || '', shot: shotName || null });
}
async function goHash(page, hash) {
  await page.evaluate(h => { window.location.hash = h; }, hash);
  await page.waitForTimeout(130);
}

/* ---------- prep a page: kill the wall, unlock everything, light all flags ---------- */
async function preparePage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + (e.message || e)));
  page.on('requestfailed', r => {
    const u = r.url();
    if (/fonts\.|gstatic|githubusercontent|analytics/.test(u)) return;     // ignore font/CDN noise
    errors.push('REQFAIL ' + u + ' :: ' + (r.failure()?.errorText || ''));
  });
  await page.goto(BASE + '#/launcher', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    try { Object.keys(localStorage).filter(k => k.startsWith('adeptio.')).forEach(k => localStorage.removeItem(k)); } catch {}
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  const prep = await page.evaluate(() => {
    const out = { portalOff: false, tier: '', licensing: '', flags: [] };
    try { if (window.AUTH && AUTH.setPortal) { AUTH.setPortal(false); out.portalOff = !AUTH.portalOn(); } } catch (e) { out.portalErr = String(e); }
    try { if (window.LICENSE && LICENSE.enabled && LICENSE.toggle) LICENSE.toggle(false); out.licensing = (window.LICENSE && LICENSE.enabled) ? 'on' : 'off'; } catch (e) {}
    try { if (window.DATA && DATA.setTier) DATA.setTier('professional'); out.tier = window.DATA ? DATA.tier() : ''; } catch (e) {}
    try { if (window.FLAGS) FLAGS.ORDER.forEach(k => { FLAGS.set(k, true, 'sys'); out.flags.push(k); }); } catch (e) {}
    try { if (window.DATA && DATA.pulse) DATA.pulse(); } catch (e) {}
    return out;
  });
  results.prep = prep;
  errors.length = 0; // discard prep-time noise; per-menu capture starts clean
  return { ctx, page, errors };
}

/* ---------- read the live nav rail / tab bar ---------- */
async function readMenu(page, persona, device) {
  // land on the persona's first screen so the shell + rail/tabs render
  await goHash(page, `#/${persona}/${device}/__landing__`);
  await page.waitForTimeout(150);
  return page.evaluate((dev) => {
    const sel = dev === 'web' ? '.rail .nav-item' : '.tabbar .tab';
    const items = [...document.querySelectorAll(sel)].map(el => ({
      label: (el.querySelector('.lbl, span')?.textContent || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      go: el.getAttribute('data-go') || null,
      act: el.getAttribute('data-act') || null,
      locked: el.classList.contains('locked')
    }));
    // group headers (web only) for inventory display
    const groups = dev === 'web'
      ? [...document.querySelectorAll('.rail .group')].map(g => g.textContent.trim())
      : [];
    return { items, groups, shellPresent: !!document.querySelector(dev === 'web' ? '.shell' : '.mobile-stage') };
  }, device);
}

/* ---------- probe one menu target ---------- */
async function probe(page, errors, persona, device, item) {
  const requested = item.go ? item.go.split('/')[2] : null;
  const rec = {
    persona, device, label: item.label, requested, go: item.go,
    locked: item.locked, status: 'OK', issues: []
  };
  if (item.locked || !item.go) {
    rec.status = item.locked ? 'LOCKED' : 'NO-LINK';
    if (item.locked) rec.issues.push('menu item is locked (tier/flag gate) — not navigable');
    if (!item.go && !item.locked) rec.issues.push('menu item has no data-go target');
    return rec;
  }
  const before = errors.length;
  try {
    await goHash(page, `#/${item.go}`);
    const info = await page.evaluate((badTokens) => {
      const appEl = document.getElementById('app');
      const text = appEl?.innerText || '';
      const title = document.title;
      // resolved screen id is encoded in the title:  "<Persona> · <screen> — Adeptio"
      let resolved = '';
      const m = title.match(/·\s*([^·]+?)\s*—\s*Adeptio/);
      if (m) resolved = m[1].trim();
      const h1 = appEl?.querySelector('.screen-head h1, #app h1, .ah-t')?.textContent?.trim() || '';
      const gos = [...document.querySelectorAll('[data-go]')].map(e => e.getAttribute('data-go'));
      const acts = [...document.querySelectorAll('[data-act]')].map(e => e.getAttribute('data-act'));
      // dead buttons: <button> not wired to go/act, not a known/handled control, not submit
      const dead = [...document.querySelectorAll('.workspace button, .app-body button')].filter(b => {
        if (b.closest('[data-go],[data-act]')) return false;
        if (b.type === 'submit') return false;
        if (b.matches('.back,.bell,.avatar-btn,.logo,.choice,.seg-logout,.seg-login')) return false;
        return true;
      }).map(b => ((b.className || '').split(' ')[0] || 'button') + '::' + (b.textContent || '').trim().slice(0, 36));
      const badGo = [];
      for (const t of [...new Set(gos)]) {
        if (t === 'launcher' || !t) continue;
        const [p, d, s] = t.split('/');
        if (!window.PERSONAS[p]) { badGo.push(t + ' (unknown persona)'); continue; }
        if (d !== 'web' && d !== 'mobile') { badGo.push(t + ' (bad device)'); continue; }
        if (!window.PERSONAS[p][d][s]) badGo.push(t + ' (missing screen builder)');
      }
      return {
        len: appEl ? appEl.innerHTML.length : 0,
        h1, resolved,
        wentLauncher: !!appEl?.querySelector('.hub-grid'),
        wentLogin: !!appEl?.querySelector('.portal, .login-card, [data-portal]') || /Sign in/.test(title),
        bad: badTokens.filter(b => text.split(/\b/).includes(b) || text.includes(' ' + b)),
        deadButtons: [...new Set(dead)],
        // build-phase stub buttons (toast-only no-ops). lang-lo is the topbar language toggle present on every screen — excluded as noise.
        stubActs: [...new Set(acts)].filter(a => a.startsWith('toast:')),
        badGo
      };
    }, BAD_TOKENS);

    rec.resolved = info.resolved; rec.h1 = info.h1; rec.appLen = info.len;

    if (info.wentLogin) { rec.status = 'ERROR'; rec.issues.push('bounced to the login wall (auth_portal not disabled?)'); }
    else if (info.wentLauncher) { rec.status = 'DEAD-MENU'; rec.issues.push('redirected to launcher (persona/screen gate)'); }
    else if (requested && info.resolved && info.resolved !== requested) {
      rec.status = 'DEAD-MENU';
      rec.issues.push(`no screen builder for "${requested}" — router fell back to "${info.resolved}"`);
    }
    if (info.len < 80) { rec.status = rec.status === 'OK' ? 'THIN' : rec.status; rec.issues.push('empty / near-empty render (' + info.len + ' chars)'); }
    if (device === 'web' && !info.h1 && !info.wentLauncher) rec.issues.push('no <h1> heading on screen');
    if (info.bad.length) { rec.status = 'TOKEN-LEAK'; rec.issues.push('leaked token(s) in UI: ' + info.bad.join(', ')); }
    if (info.badGo.length) { rec.status = rec.status === 'OK' ? 'BROKEN-LINK' : rec.status; rec.issues.push('broken data-go: ' + info.badGo.slice(0, 6).join(' | ')); }

    for (const d of info.deadButtons) results.deadButtons.push({ persona, device, screen: requested, button: d });
    for (const a of info.stubActs) results.stubActions.push({ persona, device, screen: requested, act: a });
    rec.deadButtonCount = info.deadButtons.length;
  } catch (e) {
    rec.status = 'ERROR'; rec.issues.push('THREW: ' + (e.message || e));
  }
  const newErrs = errors.slice(before);
  if (newErrs.length) {
    rec.status = 'ERROR';
    rec.consoleErrors = newErrs;
    rec.issues.push(newErrs.length + ' console/page error(s)');
  }
  if (rec.status !== 'OK' && rec.status !== 'LOCKED') {
    rec.shot = await shot(page, `${persona}-${device}-${requested || item.label}`);
    const sev = (rec.status === 'ERROR' || rec.status === 'TOKEN-LEAK') ? 'high'
      : (rec.status === 'DEAD-MENU' || rec.status === 'BROKEN-LINK') ? 'medium' : 'low';
    finding(sev, `${persona}/${device}/${requested || item.label}`, `[${rec.status}] ${rec.issues.join('; ')}`, `#/${item.go}`, rec.shot);
  }
  return rec;
}

/* ---------- main crawl ---------- */
async function crawl(browser) {
  const { ctx, page, errors } = await preparePage(browser);
  for (const persona of PERSONAS) {
    const pRec = { web: { groups: [], items: 0 }, mobile: { items: 0 } };
    for (const device of ['web', 'mobile']) {
      const menu = await readMenu(page, persona, device);
      pRec[device] = { groups: menu.groups, items: menu.items.length, shellPresent: menu.shellPresent, list: menu.items.map(i => ({ label: i.label, go: i.go, locked: i.locked })) };
      for (const item of menu.items) {
        const rec = await probe(page, errors, persona, device, item);
        results.menus.push(rec);
      }
    }
    results.personas[persona] = pRec;
  }
  await ctx.close();
}

/* ============================================================
   DOCUMENTED GAPS — curated from _BUILD-STATUS — v2.4.5.md + README
   (the "missing pieces" the build itself flags as pending/needs-rework)
   ============================================================ */
const DOCUMENTED_GAPS = [
  { id: 'G1', area: 'T1 · Approvals', priority: 'done', resolved: true, title: '✅ Unified bucketed inbox screen — BUILT (APPROVALSVIEW.inboxScreen)', detail: 'APPROVALS engine + APPROVALSVIEW.bucketsCard exist, but the standalone unified inbox view (Manager + HR) that renders APPROVALS.buckets() and calls APPROVALS.decide() is not the driving UI — the old per-tab L1/L2 screens still drive approvals.', action: 'Build the inbox view that renders APPROVALS.buckets() (shift·overtime·leave·others) and wires to APPROVALS.decide().' },
  { id: 'G2', area: 'T5 · Leave & calendar', priority: 'done', resolved: true, title: '✅ Calendar-core holiday-column — BUILT (dot + wash · week/day name)', detail: 'Holiday data is surfaced but the calendar-core render does not yet draw the holiday dot / blocking column.', action: 'Add the holiday-column render (dot/blocking) in calendar-core.js using the already-surfaced holiday data.' },
  { id: 'G3', area: 'T4 · People profile', priority: 'done', resolved: true, title: '✅ HR Profile edit form BUILT (DATA.editStaff) · Staff "Me" reuse confirmed live', detail: 'profile.js renders read-only General/Personal/Job (sealed DOB/NID masked). HR edit form and full Staff "Me" reuse were called out as pending (Staff "Me" reuse later marked done in close-out — verify live).', action: 'Build the HR Profile edit form; confirm Staff "Me" reuses PROFILE sections read-only.' },
  { id: 'G4', area: 'T3 · Payroll depth', priority: 'done', resolved: true, title: '✅ Staff ETD tile + advance-request UI — BUILT (etd/ewa gated)', detail: 'PAY.earnedToDate / PAY.requestAdvance engines exist and HR Advances surfaces ETD, but there is no Staff self-view ETD tile and no Staff advance-request UI (etd flag not wired to a staff tile).', action: 'Add a Staff ETD tile + Staff advance-request UI; wire the etd flag to the staff tile.' },
  { id: 'G5', area: 'T3 · Payroll depth', priority: 'done', resolved: true, title: '✅ Advance (EWA) recovery on run close — IMPLEMENTED', detail: 'EWA advances can be requested but are not recovered/deducted on the following payroll run.', action: 'Implement advance recovery: deduct outstanding EWA on the next pay run close.' },
  { id: 'G6', area: 'T2 · Accounting / DW', priority: 'done', resolved: true, title: '✅ CEO finance read BUILT · standalone DW workbook export deferred (folded into REP)', detail: 'DW (6-mo chart) is folded into Cost & benefit; there is no standalone Reports & export / workbook export, and the CEO board has no finance (board rollup) read.', action: 'Decide whether to add a standalone DW Reports & export screen + CEO finance read, or accept the folded view.' },
  { id: 'G7', area: 'T2 · Accounting', priority: 'done', resolved: true, title: '✅ Cashbook quick-entry BUILT (LEDGER.post) · money-cockpit M3 deferred (Cost&benefit serves the role)', detail: 'Cashbook & Cost&benefit are standalone screens; the HR pay dashboard was not rebuilt into a money cockpit, and the cashbook quick-entry control is a stub.', action: 'Rebuild HR pay-dash as money cockpit (optional) and implement cashbook quick-entry.' },
  { id: 'G8', area: 'T9 · Platform Settings', priority: 'done', resolved: true, title: '✅ Open-tier seat cap — ENFORCED at hire + import (LICENSE.seatGuard)', detail: 'PLATOWNER lets an owner set an open-tier seat cap, but the cap is not enforced anywhere.', action: 'Enforce the open-tier seat cap at account-create / import time.' },
  { id: 'G9', area: 'T0 · Gating', priority: 'done', resolved: true, title: '✅ FLAGS / LICENSE state — PERSISTED to db_platform.settings (survives reload)', detail: 'Feature-flag and licensing toggles are not persisted to db_platform, so they reset every reload.', action: 'Persist FLAGS + LICENSE state to db_platform for durability.' },
  { id: 'G10', area: 'T0 · Mobile nav', priority: 'done', resolved: true, title: '✅ Mobile tab bar now filtered by FLAGS.hiddenScreens (mirrors the web rail)', detail: 'The flag-driven nav-hide filter is applied to the web rail only; mobile tabs are not yet filtered by FLAGS.hiddenScreens.', action: 'Apply FLAGS.hiddenScreens(persona) to the mobile tab bar too.' },
  { id: 'G11', area: 'T0 · Topbar', priority: 'done', resolved: true, title: '✅ Tier chip + set-tier buttons hidden when LICENSE is OFF', detail: 'The Essential/Pro tier chip and set-tier buttons still render (cosmetic no-op) when licensing is disabled.', action: 'Hide the tier chip / set-tier buttons behind LICENSE.enabled.' },
  { id: 'G12', area: 'T6 · Channels', priority: 'low', title: 'Message over-the-wire send is a stub (accept-by-design — Worker-dependent)', detail: 'ACCEPTED: the in-app comms log already writes real db_comms.messages (send-comms); only the over-the-wire gateway dispatch awaits the keyed Cloudflare Worker (now deployed — set secrets to enable).', action: 'Accept as build-phase stub; wire send to the Worker /mail · /webhook endpoints once secrets are set.' },
  { id: 'G13', area: 'T8 · Deploy', priority: 'done', resolved: true, title: '✅ Cloudflare D1/KV/R2 created + D1 migrated · Worker deployed (secrets + Pages = owner steps)', detail: 'Deploy kit is prepped (wrangler.toml, worker/src/v245.js, migrations) but no D1/KV/R2 created, secrets not set, Worker not deployed, and client sync not rewired to the edge.', action: 'Push branch + set secrets + connect CF Pages; create D1/KV/R2, run migration, fill ids, deploy Worker, rewire client sync.' },
  { id: 'G14', area: 'QA · webShell', priority: 'done', resolved: true, title: '✅ webShell/topbar verification = this Playwright menu-flow run (accepted)', detail: 'smoke.js calls screen builders directly and never mounts the rail/topbar; the nav-filter + shell must be verified in a real browser (this menu-flow check is that verification).', action: 'Treat this Playwright menu-flow run as the standing webShell/rail verification before deploy.' }
];

/* ============================================================
   HTML REPORT (interactive triage — Adeptio brand)
   ============================================================ */
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function buildHtml() {
  const s = results.summary;
  const sevColor = { high: '#E5006D', medium: '#7A4DD6', low: '#1FB6C9', done: '#1FA97A' };
  const statusColor = {
    OK: '#1FA97A', 'DEAD-MENU': '#7A4DD6', ERROR: '#E5006D', THIN: '#C98A1F',
    'TOKEN-LEAK': '#E5006D', 'BROKEN-LINK': '#7A4DD6', LOCKED: '#8890B5', 'NO-LINK': '#C98A1F'
  };

  const liveFindings = results.menus.filter(m => m.status !== 'OK' && m.status !== 'LOCKED');
  const okCount = results.menus.filter(m => m.status === 'OK').length;
  const lockedCount = results.menus.filter(m => m.status === 'LOCKED').length;

  // ----- action rows: live findings first, then documented gaps -----
  const liveActions = liveFindings.map((m, i) => ({
    key: 'L' + i,
    priority: (m.status === 'ERROR' || m.status === 'TOKEN-LEAK') ? 'high' : (m.status === 'DEAD-MENU' || m.status === 'BROKEN-LINK') ? 'medium' : 'low',
    source: 'Live E2E',
    area: `${m.persona} · ${m.device}`,
    title: `${m.label} → [${m.status}]`,
    detail: m.issues.join('; ') + (m.go ? `  ·  route #/${m.go}` : ''),
    action: m.status === 'DEAD-MENU' ? `Build the missing "${m.requested}" screen builder in js/screens/${m.persona}.js (or remove the menu item).`
      : m.status === 'ERROR' ? `Fix the runtime error thrown by this screen (see console errors / screenshot).`
      : m.status === 'TOKEN-LEAK' ? `Fix the data binding leaking ${m.issues.join(', ')} into the UI.`
      : m.status === 'BROKEN-LINK' ? `Repair the broken data-go target(s) on this screen.`
      : `Review this screen's render.`,
    shot: m.shot || null
  }));
  const docActions = DOCUMENTED_GAPS.map(g => ({
    key: g.id, priority: g.priority, source: 'Build status', area: g.area, title: g.title, detail: g.detail, action: g.action, shot: null
  }));
  // distinct build-phase stub buttons (toast-only no-ops), with where they live
  const stubMap = new Map();
  for (const s of results.stubActions) {
    const msg = s.act.replace(/^toast:/, '');
    if (!stubMap.has(msg)) stubMap.set(msg, new Set());
    stubMap.get(msg).add(`${s.persona}/${s.device}/${s.screen}`);
  }
  const stubList = [...stubMap.entries()].map(([msg, where]) => ({ msg, where: [...where] }));
  const stubActionsRows = stubList.map((st, i) => ({
    key: 'S' + i, priority: 'low', source: 'Stub button', area: st.where[0],
    title: 'Build-phase stub: ' + (st.msg.length > 70 ? st.msg.slice(0, 70) + '…' : st.msg),
    detail: 'Appears on: ' + st.where.join(', '), action: 'Implement this control (currently a toast-only no-op) or confirm it is an intentional preview stub.', shot: null
  }));
  const allActions = [...liveActions, ...docActions, ...stubActionsRows];
  const prioRank = { high: 0, medium: 1, low: 2, done: 4 };
  allActions.sort((a, b) => prioRank[a.priority] - prioRank[b.priority]);

  const counts = {
    high: allActions.filter(a => a.priority === 'high').length,
    medium: allActions.filter(a => a.priority === 'medium').length,
    low: allActions.filter(a => a.priority === 'low').length,
    done: allActions.filter(a => a.priority === 'done').length
  };

  const summaryCards = [
    ['Menus walked', results.menus.length, '#7A4DD6'],
    ['Rendered OK', okCount, '#1FA97A'],
    ['Live issues', liveFindings.length, liveFindings.length ? '#E5006D' : '#1FA97A'],
    ['Locked / gated', lockedCount, '#8890B5'],
    ['Documented gaps', DOCUMENTED_GAPS.length, '#1FB6C9'],
    ['Action items', allActions.length, '#7A4DD6']
  ].map(([k, v, c]) => `<div class="card"><div class="num" style="color:${c}">${v}</div><div class="lbl">${k}</div></div>`).join('');

  // ----- per-persona inventory -----
  const inventory = PERSONAS.map(p => {
    const web = results.personas[p].web, mob = results.personas[p].mobile;
    const webRows = (web.list || []).map(it => {
      const rec = results.menus.find(m => m.persona === p && m.device === 'web' && m.go === it.go) || {};
      const st = rec.status || (it.locked ? 'LOCKED' : '—');
      return `<tr><td>${esc(it.label)}</td><td class="mono">${esc(it.go || '—')}</td><td><span class="pill" style="background:${statusColor[st] || '#888'}">${st}</span></td><td>${esc((rec.issues || []).join('; '))}</td></tr>`;
    }).join('');
    const mobRows = (mob.list || []).map(it => {
      const rec = results.menus.find(m => m.persona === p && m.device === 'mobile' && m.go === it.go) || {};
      const st = rec.status || (it.locked ? 'LOCKED' : '—');
      return `<tr><td>${esc(it.label)}</td><td class="mono">${esc(it.go || '—')}</td><td><span class="pill" style="background:${statusColor[st] || '#888'}">${st}</span></td><td>${esc((rec.issues || []).join('; '))}</td></tr>`;
    }).join('');
    return `<details class="persona"><summary><b>${p.toUpperCase()}</b> — web: ${web.items} items in ${(web.groups || []).length} groups · mobile: ${mob.items} tabs</summary>
      <div class="grp">Web groups: ${esc((web.groups || []).join('  ·  '))}</div>
      <table class="inv"><thead><tr><th>Menu</th><th>Route</th><th>Status</th><th>Notes</th></tr></thead><tbody>${webRows}</tbody></table>
      <div class="grp">Mobile tabs</div>
      <table class="inv"><thead><tr><th>Tab</th><th>Route</th><th>Status</th><th>Notes</th></tr></thead><tbody>${mobRows}</tbody></table>
    </details>`;
  }).join('');

  const actionRows = allActions.map(a => `
    <tr data-prio="${a.priority}" data-decision="open">
      <td><input type="checkbox" class="done"></td>
      <td><span class="pill" style="background:${sevColor[a.priority]}">${a.priority}</span></td>
      <td>${esc(a.source)}</td>
      <td><b>${esc(a.title)}</b><div class="det">${esc(a.detail)}</div><div class="fix">▶ ${esc(a.action)}</div>${a.shot ? `<div class="det"><a href="screenshots-menu/${esc(a.shot)}" target="_blank">screenshot</a></div>` : ''}</td>
      <td><select class="decision">
        <option value="open" selected>— choose —</option>
        <option value="fix">Fix now</option>
        <option value="next">Next sprint</option>
        <option value="defer">Defer</option>
        <option value="wontfix">Won't fix</option>
        <option value="expected">Expected / by design</option>
      </select></td>
    </tr>`).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Adeptio v2.4.5 — Menu Flow E2E · Status & Actions</title>
<style>
  :root{ --purple:#4B2E83; --purple2:#7A4DD6; --cyan:#1FB6C9; --magenta:#E5006D; --ink:#1c1b29; --muted:#6b7194; --bg:#f6f5fb; --line:#e6e3f3; --card:#fff; }
  *{box-sizing:border-box}
  body{font-family:Calibri,"Segoe UI",system-ui,sans-serif;margin:0;background:var(--bg);color:var(--ink);line-height:1.5}
  h1,h2,h3{font-family:Georgia,"Times New Roman",serif;color:var(--purple)}
  header.hero{background:linear-gradient(120deg,var(--purple),var(--purple2) 60%,var(--magenta));color:#fff;padding:34px 40px 30px}
  header.hero h1{color:#fff;margin:0 0 6px;font-size:30px}
  header.hero .sub{opacity:.92;font-size:14px}
  header.hero .meta{margin-top:14px;font-size:12.5px;opacity:.9;display:flex;gap:18px;flex-wrap:wrap}
  header.hero .meta b{color:#bff4fb}
  .wrap{max-width:1180px;margin:0 auto;padding:26px 40px 80px}
  .cards{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin:-46px 0 26px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;text-align:center;box-shadow:0 8px 24px rgba(75,46,131,.08)}
  .card .num{font-size:30px;font-weight:800;font-family:Georgia,serif}
  .card .lbl{font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-top:3px}
  section{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px 24px;margin-bottom:22px;box-shadow:0 6px 18px rgba(75,46,131,.05)}
  section > h2{margin:0 0 4px;font-size:21px}
  .lead{color:var(--muted);font-size:13.5px;margin:0 0 16px}
  .toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
  .toolbar button{font:inherit;font-size:12.5px;border:1px solid var(--line);background:#fff;color:var(--purple);padding:7px 13px;border-radius:9px;cursor:pointer;font-weight:600}
  .toolbar button:hover{background:#f1ecfb}
  .toolbar button.on{background:var(--purple);color:#fff;border-color:var(--purple)}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);background:#faf9fe;position:sticky;top:0}
  .pill{color:#fff;border-radius:999px;padding:2px 10px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap}
  .det{color:var(--muted);font-size:12px;margin-top:4px}
  .fix{color:var(--purple2);font-size:12.5px;margin-top:5px;font-weight:600}
  .mono{font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;font-size:11.5px;color:#555}
  select.decision{font:inherit;font-size:12px;padding:5px 8px;border-radius:8px;border:1px solid var(--line);background:#fff}
  tr[data-decision="fix"]{background:#fff3f8}
  tr[data-decision="next"]{background:#f3effc}
  tr[data-decision="defer"],tr[data-decision="wontfix"],tr[data-decision="expected"]{opacity:.55}
  tr.hidden{display:none}
  details.persona{border:1px solid var(--line);border-radius:12px;margin-bottom:10px;padding:6px 12px;background:#fcfbff}
  details.persona summary{cursor:pointer;font-size:14px;padding:6px 2px}
  .grp{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin:12px 0 4px}
  table.inv td:first-child{font-weight:600}
  .legend{font-size:12px;color:var(--muted);margin-top:10px}
  .legend span{display:inline-block;margin-right:14px}
  footer{color:var(--muted);font-size:12px;text-align:center;padding:24px}
  @media print{.toolbar,select.decision{display:none}body{background:#fff}section{box-shadow:none;break-inside:avoid}}
</style></head>
<body>
<header class="hero">
  <h1>Adeptio Adaptive HR v2.4.5 — Menu Flow E2E</h1>
  <div class="sub">Single Platform · Single Tenant — end-to-end navigation crawl (real Chromium) + status of missing pieces & actions to take.</div>
  <div class="meta">
    <span>Run: <b>${esc(results.startedAt)}</b></span>
    <span>Portal: <b>${esc(results.prep?.portalOff ? 'disabled ✓' : 'NOT disabled ⚠')}</b></span>
    <span>Tier: <b>${esc(results.prep?.tier || '?')}</b></span>
    <span>Licensing: <b>${esc(results.prep?.licensing || '?')}</b></span>
    <span>Flags: <b>all on (${esc((results.prep?.flags || []).length)})</b></span>
  </div>
</header>
<div class="wrap">
  <div class="cards">${summaryCards}</div>

  <section>
    <h2>1 · Actions to select &amp; take</h2>
    <p class="lead">Live E2E findings + documented build gaps, prioritised. Tick what's done, set a decision per row — High = ${counts.high} · Medium = ${counts.medium} · Low = ${counts.low}. Use the filters; "Print / Save PDF" keeps your decisions.</p>
    <div class="toolbar">
      <button data-f="all" class="on">All (${allActions.length})</button>
      <button data-f="high">High (${counts.high})</button>
      <button data-f="medium">Medium (${counts.medium})</button>
      <button data-f="low">Low (${counts.low})</button>
      <button data-f="done">Done (${counts.done})</button>
      <button data-f="live">Live E2E only (${liveActions.length})</button>
      <button data-f="hideDone">Hide ticked</button>
      <button onclick="window.print()">🖨 Print / Save PDF</button>
    </div>
    <table id="actions"><thead><tr><th>✓</th><th>Pri</th><th>Source</th><th>Issue &amp; recommended action</th><th>Decision</th></tr></thead>
    <tbody>${actionRows}</tbody></table>
  </section>

  <section>
    <h2>2 · Menu inventory &amp; per-screen status</h2>
    <p class="lead">Every menu item the live rail / tab bar actually rendered (with all feature flags ON, licensing OFF, tier Professional). Expand a persona.</p>
    <div class="legend">
      <span><span class="pill" style="background:${statusColor.OK}">OK</span> renders</span>
      <span><span class="pill" style="background:${statusColor['DEAD-MENU']}">DEAD-MENU</span> no builder / redirect</span>
      <span><span class="pill" style="background:${statusColor.ERROR}">ERROR</span> console/page error</span>
      <span><span class="pill" style="background:${statusColor.THIN}">THIN</span> empty-ish</span>
      <span><span class="pill" style="background:${statusColor.LOCKED}">LOCKED</span> gated</span>
    </div>
    <div style="margin-top:14px">${inventory}</div>
  </section>

  <section>
    <h2>3 · Build-phase stub buttons (${stubList.length})</h2>
    <p class="lead">Controls that render and click but are intentional toast-only no-ops in this preview — each is a concrete "finish me" item (the actual wiring lands in the build / Cloudflare-DB phase).</p>
    <table><thead><tr><th>Stub message</th><th>Where it appears</th></tr></thead><tbody>
      ${stubList.map(st => `<tr><td>${esc(st.msg)}</td><td class="mono">${esc(st.where.join('  ·  '))}</td></tr>`).join('')}
    </tbody></table>
  </section>

  <section>
    <h2>4 · How this was checked</h2>
    <p class="lead">Reproducible: <span class="mono">node tools/e2e/menu-flow.mjs</span></p>
    <ul style="font-size:13.5px;color:#333">
      <li>Local static server on <span class="mono">${esc(BASE)}</span> serving the working tree (no deploy needed).</li>
      <li><b>auth_portal</b> disabled, <b>licensing</b> turned OFF (all features unlocked), <b>tier</b> = Professional, and <b>every feature flag enabled</b> so flag-hidden menus are also walked.</li>
      <li>For each persona × {web rail, mobile tabs}: navigate to each live menu item, then classify by resolved screen (read from <span class="mono">document.title</span>), <span class="mono">&lt;h1&gt;</span> presence, render size, leaked tokens, broken <span class="mono">data-go</span>, dead buttons, console/page errors.</li>
      <li>A <b>DEAD-MENU</b> means the menu item points at a screen id with no builder — the router silently fell back to another screen. That is the clearest "missing piece" signal.</li>
      <li>Section 1 also folds in the build's own documented gaps from <span class="mono">_BUILD-STATUS — v2.4.5.md</span> and the build-phase stub buttons in section 3.</li>
    </ul>
  </section>
</div>
<footer>Adeptio Adaptive HR v2.4.5 · menu-flow E2E · generated ${esc(results.finishedAt || results.startedAt)} · demo data only, no real records.</footer>
<script>
  const rows=[...document.querySelectorAll('#actions tbody tr')];
  let mode='all', hideDone=false;
  function apply(){
    rows.forEach(r=>{
      const p=r.dataset.prio, live=r.querySelector('td:nth-child(3)').textContent.includes('Live');
      let show = mode==='all'||mode===p||(mode==='live'&&live);
      if(hideDone && r.querySelector('.done').checked) show=false;
      r.classList.toggle('hidden',!show);
    });
  }
  document.querySelectorAll('.toolbar button[data-f]').forEach(b=>b.addEventListener('click',()=>{
    if(b.dataset.f==='hideDone'){hideDone=!hideDone;b.classList.toggle('on',hideDone);apply();return;}
    mode=b.dataset.f;
    document.querySelectorAll('.toolbar button[data-f]').forEach(x=>{if(x.dataset.f!=='hideDone')x.classList.remove('on')});
    b.classList.add('on');apply();
  }));
  document.querySelectorAll('.decision').forEach(s=>s.addEventListener('change',()=>{s.closest('tr').dataset.decision=s.value;}));
  document.querySelectorAll('.done').forEach(c=>c.addEventListener('change',apply));
</script>
</body></html>`;
}

/* ---------- main ---------- */
(async () => {
  const srv = await startServer();
  console.log('Static server on ' + BASE + ' (root: ' + ROOT + ')');
  const browser = await chromium.launch();
  try {
    console.log('Preparing page (portal off · licensing off · tier pro · all flags on)…');
    await crawl(browser);
  } catch (e) {
    console.error('CRAWL ERROR:', e);
    results.fatal = String(e && e.stack || e);
  }
  await browser.close();
  srv.close();

  const live = results.menus.filter(m => m.status !== 'OK' && m.status !== 'LOCKED');
  results.summary = {
    menusWalked: results.menus.length,
    ok: results.menus.filter(m => m.status === 'OK').length,
    locked: results.menus.filter(m => m.status === 'LOCKED').length,
    liveIssues: live.length,
    byStatus: live.reduce((a, m) => (a[m.status] = (a[m.status] || 0) + 1, a), {}),
    deadButtonCandidates: new Set(results.deadButtons.map(d => d.persona + '/' + d.device + '/' + d.screen + '::' + d.button)).size,
    stubActionScreens: new Set(results.stubActions.map(s => s.persona + '/' + s.device + '/' + s.screen)).size,
    documentedGaps: DOCUMENTED_GAPS.length,
    findings: results.findings.length
  };
  results.finishedAt = new Date().toISOString();

  fs.writeFileSync(path.join(__dirname, 'menu-flow-results.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(__dirname, 'menu-flow-report.html'), buildHtml());

  console.log('\n==== MENU FLOW SUMMARY ====');
  console.log(JSON.stringify(results.summary, null, 2));
  if (live.length) {
    console.log('\nLive issues:');
    live.forEach(m => console.log('  ✗', m.persona + '/' + m.device + '/' + (m.requested || m.label), '—', '[' + m.status + ']', m.issues.join('; ')));
  } else {
    console.log('\nNo live menu-flow issues — every rendered menu resolved to a real screen.');
  }
  console.log('\nWrote: tools/e2e/menu-flow-results.json');
  console.log('Wrote: tools/e2e/menu-flow-report.html');
  console.log('Shots: tools/e2e/screenshots-menu/');
})();
