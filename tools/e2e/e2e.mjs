/* ============================================================
   ADEPTIO Adaptive HR — Platform UI v2.3.2.db
   End-to-end test harness (Playwright, real Chromium)

   Extends tools/smoke.js (structural, node) into a live-browser
   crawl + user-flow + DB-persistence suite against the deployed
   client-rendered SPA.

   Run:  node e2e.mjs [baseUrl]
   Default base: https://torukung.github.io/hr_saas_v_2_3_2_db/

   Outputs: results.json  +  screenshots/<id>.png for every failure
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] || 'https://torukung.github.io/hr_saas_v_2_3_2_db/').replace(/#.*$/, '');
const SHOTS = path.join(__dirname, 'screenshots');
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });

const results = { base: BASE, startedAt: new Date().toISOString(), crawl: [], flows: [], deadButtons: [], stubActions: [], findings: [] };
let shotN = 0;

// Param map for detail/child screens (extends the set in tools/smoke.js).
const PARAMS = {
  'request-detail': 'LV-0481', 'payslip': 'PS-2026-05', 'request-new': 'Claim',
  'approval': 'EX-0210', 'member': 'EMP-0214', 'person': 'EMP-0214',
  'payroll-run': 'PR-2026-06', 'division': 'Sales', 'template': 'TPL-023',
  'dbstore': 'db_people', 'data': 'db_people', 'report-run': '', 'report-files': '',
  'person-new': '', 'mydata': '', 'teamdata': ''
};

const BAD_TOKENS = ['undefined', 'NaN', '[object Object]'];

function finding(severity, area, title, detail, shot) {
  results.findings.push({ severity, area, title, detail, shot: shot || null });
}

async function shot(page, label) {
  const name = `${String(++shotN).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '_').slice(0, 80)}.png`;
  try { await page.screenshot({ path: path.join(SHOTS, name), fullPage: true }); } catch { /* frame may be detached */ }
  return name;
}

/* ---------- render helper: drive the SPA by hash, wait for repaint ---------- */
async function goHash(page, hash) {
  await page.evaluate(h => { window.location.hash = h; }, hash);
  // app re-renders synchronously on hashchange; give CSS fade + any async a beat
  await page.waitForTimeout(120);
}

/* ---------- enumerate the live screen graph ---------- */
async function screenGraph(page) {
  return page.evaluate(() => {
    const g = {};
    for (const [k, P] of Object.entries(PERSONAS)) {
      g[k] = {
        web: Object.keys(P.web), mobile: Object.keys(P.mobile),
        nav: P.nav.flatMap(gr => gr.items.map(i => ({ id: i.id, lock: i.lock || null }))),
        tabs: P.tabs.map(t => ({ id: t.id, lock: t.lock || null })),
        parent: P.parent || {}, tabParent: P.tabParent || {}
      };
    }
    return g;
  });
}

/* ============================================================
   PHASE A — route crawl: every persona × device × screen × tier
   ============================================================ */
async function crawlTier(browser, tier) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + (e.message || e)));
  page.on('requestfailed', r => {
    const u = r.url();
    // ignore font/analytics noise; flag app asset + 404s
    if (/githubusercontent|fonts\.|analytics|gstatic/.test(u)) return;
    consoleErrors.push('REQFAIL ' + u + ' :: ' + (r.failure()?.errorText || ''));
  });

  const url = BASE + (tier === 'professional' ? '?tier=professional' : '') + '#/launcher';
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  // make sure tier actually took (belt + suspenders)
  await page.evaluate(t => { if (DATA.tier() !== t) DATA.setTier(t); }, tier);
  await page.waitForTimeout(150);

  const graph = await screenGraph(page);
  const personaLocked = await page.evaluate(() =>
    Object.fromEntries(Object.keys(PERSONAS).map(k =>
      [k, (k === 'ceo' && !DATA.has('ceo')) || (k === 'sysadmin' && !DATA.has('sysadmin'))])));

  for (const [persona, P] of Object.entries(graph)) {
    for (const device of ['web', 'mobile']) {
      for (const screen of P[device]) {
        const param = PARAMS[screen] !== undefined ? PARAMS[screen] : undefined;
        let hash = `#/${persona}/${device}/${screen}` + (param ? `/${param}` : '');
        const before = consoleErrors.length;
        let rec = { tier, persona, device, screen, hash, ok: true, issues: [] };
        try {
          // resolve report-run param live (needs a real saved run id)
          if (screen === 'report-run') {
            const rid = await page.evaluate(p => { try { return (DB.reports.runs(undefined).find(r => r.report) || {}).id || ''; } catch { return ''; } }, persona);
            if (rid) hash = `#/${persona}/${device}/${screen}/${rid}`;
          }
          await goHash(page, hash);
          const info = await page.evaluate(() => {
            const r = (window.__route_dbg ? window.__route_dbg() : null);
            const appEl = document.getElementById('app');
            const text = (appEl?.innerText || '');
            const h1 = appEl?.querySelector('h1, .ah-t')?.textContent?.trim() || '';
            // resolved route from the hash
            const h = location.hash.replace(/^#\/?/, '').split('/');
            return {
              len: appEl ? appEl.innerHTML.length : 0,
              h1, title: document.title,
              hasBad: ['undefined', 'NaN', '[object Object]'].filter(b => text.includes(b)),
              wentLauncher: !!appEl?.querySelector('.hub-grid'),
              resolvedScreen: document.querySelector('.nav-item[aria-current="true"], .tab[aria-current="true"]')?.querySelector('.lbl,span')?.textContent || h[2] || ''
            };
          });
          rec.h1 = info.h1; rec.appLen = info.len;

          // tier-gated personas legitimately bounce to launcher on essential
          const expectedGate = tier === 'essential' && personaLocked[persona];
          if (info.wentLauncher && !expectedGate && persona !== undefined) {
            // a non-gated screen that fell back to launcher = dead/locked route
            rec.ok = false; rec.issues.push('redirected to launcher (unexpected)');
          }
          if (info.len < 50) { rec.ok = false; rec.issues.push('empty/near-empty render (' + info.len + ' chars)'); }
          if (info.hasBad.length) { rec.ok = false; rec.issues.push('leaked tokens: ' + info.hasBad.join(', ')); }
          if (device === 'web' && !info.h1 && !info.wentLauncher) { rec.issues.push('no <h1> heading'); }

          // collect data-go / data-act targets present on this screen and validate data-go
          const links = await page.evaluate(() => {
            const gos = [...document.querySelectorAll('[data-go]')].map(e => e.getAttribute('data-go'));
            const acts = [...document.querySelectorAll('[data-act]')].map(e => e.getAttribute('data-act'));
            // dead buttons: <button> with no data-go/act ancestor, not type=submit, not a known control
            const dead = [...document.querySelectorAll('button')].filter(b => {
              if (b.closest('[data-go],[data-act]')) return false;
              if (b.type === 'submit') return false;
              if (b.matches('.back,.bell,.avatar-btn,.logo,.choice')) return false; // known/handled elsewhere
              return true;
            }).map(b => (b.className || '') + '::' + (b.textContent || '').trim().slice(0, 40));
            return { gos: [...new Set(gos)], acts: [...new Set(acts)], dead: [...new Set(dead)] };
          });
          // validate every data-go target resolves to a real persona/device/screen
          const badGos = await page.evaluate(targets => {
            const bad = [];
            for (const t of targets) {
              if (t === 'launcher') continue;
              const [p, d, s] = t.split('/');
              if (!PERSONAS[p]) { bad.push(t + ' (unknown persona)'); continue; }
              if (d !== 'web' && d !== 'mobile') { bad.push(t + ' (bad device)'); continue; }
              if (!PERSONAS[p][d][s]) bad.push(t + ' (missing screen)');
            }
            return bad;
          }, links.gos);
          if (badGos.length) { rec.ok = false; rec.issues.push('broken data-go: ' + badGos.join(' | ')); }

          // accumulate dead-button candidates
          for (const d of links.dead) {
            results.deadButtons.push({ tier, persona, device, screen, button: d });
          }
          // catalog stub/no-op actions (toast-only + the staged language pack) — informational
          for (const a of links.acts) {
            if (a.startsWith('toast:') || a === 'lang-lo') results.stubActions.push({ tier, persona, device, screen, act: a });
          }
        } catch (e) {
          rec.ok = false; rec.issues.push('THREW: ' + (e.message || e));
        }
        // attribute any console errors fired during this route
        const newErrs = consoleErrors.slice(before);
        if (newErrs.length) { rec.ok = false; rec.consoleErrors = newErrs; rec.issues.push(newErrs.length + ' console error(s)'); }

        if (!rec.ok) {
          rec.shot = await shot(page, `${tier}-${persona}-${device}-${screen}`);
          finding(newErrs.length ? 'high' : 'medium', `${persona}/${device}/${screen}`,
            `[${tier}] ${rec.issues.join('; ')}`, hash, rec.shot);
        }
        results.crawl.push(rec);
      }
    }
  }
  await ctx.close();
  return consoleErrors;
}

/* ============================================================
   PHASE B — persona user flows + DB persistence verification
   ============================================================ */
async function freshPage(browser, tier) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + (e.message || e)));
  await page.goto(BASE + (tier === 'professional' ? '?tier=professional' : '') + '#/launcher', { waitUntil: 'networkidle' });
  // clean slate: clear persisted demo data so seeds re-hydrate deterministically
  await page.evaluate(() => { try { Object.keys(localStorage).filter(k => k.startsWith('adeptio.')).forEach(k => localStorage.removeItem(k)); } catch {} });
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(t => { if (DATA.tier() !== t) DATA.setTier(t); }, tier);
  await page.waitForTimeout(200);
  return { ctx, page, errs };
}

function flow(name) { const f = { name, steps: [], ok: true }; results.flows.push(f); return f; }
async function step(f, page, desc, fn) {
  const s = { desc, ok: true, info: '' };
  try {
    const r = await fn();
    if (r && r.ok === false) { s.ok = false; s.info = r.info || ''; }
    else if (typeof r === 'string') s.info = r;
    else if (r && r.info) s.info = r.info;
  } catch (e) { s.ok = false; s.info = 'THREW: ' + (e.message || e); }
  if (!s.ok) {
    f.ok = false;
    s.shot = await shot(page, `flow-${f.name}-${desc}`);
    finding('high', 'flow/' + f.name, desc + ' — ' + s.info, '', s.shot);
  }
  f.steps.push(s);
  return s.ok;
}

// click the first element whose data-act starts with prefix; returns false if none
async function clickAct(page, prefix) {
  return page.evaluate(p => {
    const el = [...document.querySelectorAll('[data-act]')].find(e => e.getAttribute('data-act').startsWith(p));
    if (!el) return false; el.click(); return el.getAttribute('data-act');
  }, prefix);
}
async function clickGo(page, target) {
  return page.evaluate(t => {
    const el = [...document.querySelectorAll('[data-go]')].find(e => e.getAttribute('data-go') === t)
      || [...document.querySelectorAll('[data-go]')].find(e => e.getAttribute('data-go').startsWith(t));
    if (!el) return false; el.click(); return el.getAttribute('data-go');
  }, target);
}
// read a store's rows in-page
const rows = (page, store, table) => page.evaluate(([s, t]) => DB.list(s, t), [store, table]);
// confirm a predicate survives a reload (true persistence)
async function survivesReload(page, fn, arg) {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  return page.evaluate(fn, arg);
}

async function runFlows(browser) {
  /* ---------- STAFF ---------- */
  {
    const { ctx, page } = await freshPage(browser, 'essential');
    const f = flow('staff');
    await goHash(page, '#/staff/web/request-new/Leave');
    await step(f, page, 'submit a Leave request persists to db_workflow', async () => {
      const before = (await rows(page, 'db_workflow', 'requests')).length;
      const act = await clickAct(page, 'submit-request:Leave');
      if (!act) return { ok: false, info: 'no submit-request:Leave button found' };
      await page.waitForTimeout(250);
      const after = await rows(page, 'db_workflow', 'requests');
      const added = after.find(r => r.type === 'Leave' && /UI preview/.test(r.note || ''));
      if (after.length !== before + 1 || !added) return { ok: false, info: `row not added (before ${before}, after ${after.length})` };
      const persisted = await survivesReload(page, id => DB.list('db_workflow', 'requests').some(r => r.id === id), added.id);
      if (!persisted) return { ok: false, info: 'request ' + added.id + ' did NOT survive reload' };
      return 'added ' + added.id + ' · survived reload';
    });
    // clock toggle on mobile
    await goHash(page, '#/staff/mobile/time');
    await step(f, page, 'clock in/out writes a punch to db_time', async () => {
      const before = (await rows(page, 'db_time', 'punches')).length;
      const stIn = await page.evaluate(() => DATA.state.clockedIn);
      const act = await clickAct(page, 'clock');
      if (!act) return { ok: false, info: 'no clock button on staff/mobile/time' };
      await page.waitForTimeout(200);
      const after = (await rows(page, 'db_time', 'punches')).length;
      // clocking OUT closes a punch (count steady); clocking IN adds one
      if (stIn && after !== before) return { ok: false, info: 'clock-out should not add a punch' };
      if (!stIn && after !== before + 1) return { ok: false, info: 'clock-in did not add a punch' };
      return 'clock toggled (' + (stIn ? 'out' : 'in') + '), punches ' + before + '→' + after;
    });
    await ctx.close();
  }

  /* ---------- MANAGER ---------- */
  {
    const { ctx, page } = await freshPage(browser, 'essential');
    const f = flow('manager');
    await goHash(page, '#/manager/web/approvals');
    await step(f, page, 'approve a pending request flips status in db_workflow + persists', async () => {
      const pend = (await rows(page, 'db_workflow', 'requests')).find(r => r.status === 'pending');
      if (!pend) return { ok: false, info: 'no pending request to approve' };
      const act = await clickAct(page, 'approve:' + pend.id);
      if (!act) {
        // fall back to any approve button
        const any = await clickAct(page, 'approve:');
        if (!any) return { ok: false, info: 'no approve button rendered in manager approvals' };
      }
      await page.waitForTimeout(250);
      const persisted = await survivesReload(page, id => {
        const r = DB.list('db_workflow', 'requests').find(x => x.id === id);
        return r && r.status === 'approved';
      }, pend.id);
      if (!persisted) return { ok: false, info: pend.id + ' not approved/persisted after reload' };
      return pend.id + ' approved · survived reload';
    });
    await ctx.close();
  }

  /* ---------- HR ---------- */
  {
    const { ctx, page } = await freshPage(browser, 'professional');
    const f = flow('hr');
    await goHash(page, '#/hr/web/person-new');
    await step(f, page, 'hire a new employee persists to db_people (+ leave balance)', async () => {
      const before = (await rows(page, 'db_people', 'employees')).length;
      const ok = await page.evaluate(() => {
        const set = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; return true; } return false; };
        return set('st-name', 'E2E Tester Khamla') & set('st-pos', 'QA Engineer') & set('st-div', 'Admin') & set('st-team', '—');
      });
      if (!ok) return { ok: false, info: 'new-hire form fields (st-name…) not found' };
      const act = await clickAct(page, 'staff-add');
      if (!act) return { ok: false, info: 'no staff-add button' };
      await page.waitForTimeout(300);
      const after = await rows(page, 'db_people', 'employees');
      const hired = after.find(e => e.name === 'E2E Tester Khamla');
      if (!hired) return { ok: false, info: `employee not added (before ${before}, after ${after.length})` };
      const bal = (await rows(page, 'db_leave', 'balances')).some(b => b.emp === hired.id);
      if (!bal) return { ok: false, info: 'leave balance not provisioned on hire (event chain broken)' };
      const persisted = await survivesReload(page, id => DB.list('db_people', 'employees').some(e => e.id === id), hired.id);
      if (!persisted) return { ok: false, info: hired.id + ' did not survive reload' };
      return 'hired ' + hired.id + ' + leave balance · survived reload';
    });
    await goHash(page, '#/hr/web/payroll-run/PR-2026-06');
    await step(f, page, 'advance a payroll run mutates db_payroll + persists', async () => {
      const r0 = (await rows(page, 'db_payroll', 'payroll_runs')).find(r => r.id === 'PR-2026-06');
      if (!r0) return { ok: false, info: 'PR-2026-06 not found' };
      const act = await clickAct(page, 'advance-run:PR-2026-06');
      if (!act) return { ok: false, info: 'no advance-run button on payroll-run page' };
      await page.waitForTimeout(250);
      const persisted = await survivesReload(page, step0 => {
        const r = DB.list('db_payroll', 'payroll_runs').find(x => x.id === 'PR-2026-06');
        return r && r.step > step0;
      }, r0.step);
      if (!persisted) return { ok: false, info: 'payroll run step did not advance/persist' };
      return 'PR-2026-06 advanced from step ' + r0.step + ' · survived reload';
    });
    await goHash(page, '#/hr/web/comms');
    await step(f, page, 'send a broadcast writes to db_comms', async () => {
      const before = (await rows(page, 'db_comms', 'messages')).length;
      const act = await clickAct(page, 'send-comms');
      if (!act) return { ok: false, info: 'no send-comms button on hr/comms (may be tier-gated)' };
      await page.waitForTimeout(250);
      const after = (await rows(page, 'db_comms', 'messages')).length;
      if (after !== before + 1) return { ok: false, info: `message not logged (before ${before}, after ${after})` };
      return 'comms logged, messages ' + before + '→' + after;
    });
    await ctx.close();
  }

  /* ---------- SYSADMIN / database management ---------- */
  {
    const { ctx, page } = await freshPage(browser, 'professional');
    const f = flow('sysadmin-db');
    await goHash(page, '#/sysadmin/web/dbstore/db_people');
    await step(f, page, 'db console add-row persists to db_people', async () => {
      const before = (await rows(page, 'db_people', 'employees')).length;
      const act = await clickAct(page, 'db-add:db_people:employees');
      if (!act) return { ok: false, info: 'no db-add control on sysadmin data/db_people view' };
      await page.waitForTimeout(300);
      const after = (await rows(page, 'db_people', 'employees')).length;
      if (after !== before + 1) return { ok: false, info: `db-add did not add a row (before ${before}, after ${after})` };
      const persisted = await survivesReload(page, n => DB.list('db_people', 'employees').length === n, after);
      if (!persisted) return { ok: false, info: 'added row count did not survive reload' };
      return 'db-add row, ' + before + '→' + after + ' · survived reload';
    });
    await step(f, page, 'backup → restore round-trip (per-store)', async () => {
      const r = await page.evaluate(() => {
        const before = DB.rows('db_people');
        const bk = DB.backups.now(['db_people'], 'manual', 'e2e', 'tester');
        DB.add('db_people', 'employees', { id: 'EMP-DEL01', name: 'Temp', pos: 'X', div: 'Admin', team: '—', state: 'present', in: '08:00', attend: 100, ot: 0, leaveBal: 9, since: 'Jun 2026' });
        const bumped = DB.rows('db_people');
        DB.backups.restore(bk.id, ['db_people'], 'tester');
        const after = DB.rows('db_people');
        return { before, bumped, after, restored: after === before };
      });
      if (!r.restored) return { ok: false, info: `restore did not rewind (before ${r.before}, bumped ${r.bumped}, after ${r.after})` };
      return 'backup/restore rewound ' + r.bumped + '→' + r.after;
    });
    await ctx.close();
  }

  /* ---------- REPORTS ---------- */
  {
    const { ctx, page } = await freshPage(browser, 'professional');
    const f = flow('reports');
    await goHash(page, '#/manager/web/reports');
    await step(f, page, 'generate a report run saves to dw_reports + persists', async () => {
      const act = await clickAct(page, 'report-gen:');
      if (!act) return { ok: false, info: 'no report-gen button on manager reports' };
      await page.waitForTimeout(350);
      const head = await page.evaluate(() => { const r = DB.reports.runs()[0]; return r ? { id: r.id, report: r.report } : null; });
      if (!head) return { ok: false, info: 'no run saved after generate' };
      const persisted = await survivesReload(page, id => DB.reports.runs().some(r => r.id === id), head.id);
      if (!persisted) return { ok: false, info: head.id + ' run did not survive reload' };
      return 'generated ' + head.id + ' (' + head.report + ') · survived reload';
    });
    await ctx.close();
  }
}

/* ============================================================
   PHASE C2 — robustness: SPA-404 equivalents & cold deep-links
   ============================================================ */
async function robustnessCheck(browser) {
  results.robustness = [];
  // (1) bogus params + unknown routes via hash change on a warm page
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + (e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(BASE + '?tier=professional#/launcher', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const bogus = [
    '#/hr/web/person/EMP-DOES-NOT-EXIST',
    '#/manager/web/approval/ZZ-9999',
    '#/staff/web/payslip/PS-NOPE',
    '#/sysadmin/web/dbstore/db_not_a_store',
    '#/manager/web/report-run/RPT-NONE',
    '#/foo/bar/baz',            // unknown persona
    '#/staff/banana/home',      // bad device
    '#/staff/web/totally-fake'  // unknown screen
  ];
  for (const h of bogus) {
    const before = errs.length;
    await goHash(page, h);
    const info = await page.evaluate(() => {
      const app = document.getElementById('app');
      const text = app?.innerText || '';
      return { len: app ? app.innerHTML.length : 0, bad: ['undefined', 'NaN', '[object Object]'].filter(b => text.includes(b)), launcher: !!app?.querySelector('.hub-grid') };
    });
    const threw = errs.slice(before);
    const rec = { route: h, appLen: info.len, fellBackToLauncher: info.launcher, leakedTokens: info.bad, errors: threw, ok: threw.length === 0 && info.len > 50 && info.bad.length === 0 };
    if (!rec.ok) { rec.shot = await shot(page, 'robust-' + h); finding('high', 'robustness', 'Bad route mishandled: ' + h + ' — ' + (threw.join('; ') || info.bad.join(',')), '', rec.shot); }
    results.robustness.push(rec);
  }
  await ctx.close();

  // (2) cold deep-link loads (full navigation straight to a deep route — bookmark/refresh scenario)
  for (const deep of ['#/hr/web/payroll-run/PR-2026-06', '#/staff/web/payslips', '#/sysadmin/web/audit', '#/ceo/web/board']) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await c.newPage();
    const e2 = [];
    pg.on('pageerror', e => e2.push(String(e.message || e)));
    pg.on('console', m => { if (m.type() === 'error') e2.push(m.text()); });
    await pg.goto(BASE + '?tier=professional' + deep, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(400);
    const info = await pg.evaluate(() => ({ len: document.getElementById('app')?.innerHTML.length || 0, h1: document.querySelector('#app h1')?.textContent || '', launcher: !!document.querySelector('.hub-grid') }));
    const ok = e2.length === 0 && info.len > 50 && !info.launcher;
    const rec = { coldDeepLink: deep, h1: info.h1, appLen: info.len, fellBackToLauncher: info.launcher, errors: e2, ok };
    if (!ok) { rec.shot = await shot(pg, 'coldlink-' + deep); finding('high', 'deep-link', 'Cold deep-link failed: ' + deep + ' — ' + (e2.join('; ') || (info.launcher ? 'fell back to launcher' : 'empty')), '', rec.shot); }
    results.robustness.push(rec);
    await c.close();
  }
}

/* ============================================================
   PHASE C — responsive sanity (real mobile viewport)
   ============================================================ */
async function responsiveCheck(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '#/staff/mobile/home', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const s = await shot(page, 'responsive-390-staff-mobile-home');
  if (overflow > 4) finding('low', 'responsive', 'Horizontal overflow at 390px (' + overflow + 'px) on staff/mobile/home', '', s);
  results.responsive = { viewport: '390x844', horizontalOverflowPx: overflow, shot: s };
  await ctx.close();
}

/* ---------- main ---------- */
(async () => {
  const browser = await chromium.launch();
  console.log('Crawling essential tier…');
  await crawlTier(browser, 'essential');
  console.log('Crawling professional tier…');
  await crawlTier(browser, 'professional');
  console.log('Running persona flows…');
  await runFlows(browser);
  console.log('Robustness / bad-route / cold deep-link check…');
  try { await robustnessCheck(browser); } catch (e) { console.log('robustness check skipped:', e.message); }
  console.log('Responsive check…');
  try { await responsiveCheck(browser); } catch (e) { console.log('responsive check skipped:', e.message); }
  // evidence screenshots (proof of a green run)
  try {
    const ec = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const ep = await ec.newPage();
    for (const [h, lbl] of [['?tier=professional#/launcher', 'evidence-launcher-pro'], ['?tier=professional#/ceo/web/board', 'evidence-ceo-board'], ['?tier=professional#/sysadmin/web/dbstore/db_people', 'evidence-sysadmin-dbstore']]) {
      await ep.goto(BASE + h, { waitUntil: 'networkidle' }); await ep.waitForTimeout(400); await shot(ep, lbl);
    }
    await ec.close();
  } catch (e) { console.log('evidence shots skipped:', e.message); }
  await browser.close();

  // summarize
  const crawlFail = results.crawl.filter(c => !c.ok);
  const flowFail = results.flows.filter(f => !f.ok);
  results.summary = {
    routesCrawled: results.crawl.length,
    routeFailures: crawlFail.length,
    flows: results.flows.length,
    flowFailures: flowFail.length,
    deadButtonCandidates: new Set(results.deadButtons.map(d => d.persona + '/' + d.device + '/' + d.screen + '::' + d.button)).size,
    stubActionScreens: new Set(results.stubActions.map(s => s.persona + '/' + s.device + '/' + s.screen)).size,
    robustnessProbes: (results.robustness || []).length,
    robustnessFailures: (results.robustness || []).filter(r => !r.ok).length,
    findings: results.findings.length
  };
  results.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2));
  console.log('\n==== SUMMARY ====');
  console.log(JSON.stringify(results.summary, null, 2));
  console.log('Route failures:'); crawlFail.forEach(c => console.log('  ✗', c.tier, c.persona + '/' + c.device + '/' + c.screen, '—', c.issues.join('; ')));
  console.log('Flow failures:'); flowFail.forEach(f => f.steps.filter(s => !s.ok).forEach(s => console.log('  ✗', f.name, '—', s.desc, '::', s.info)));
  console.log('results.json + screenshots written.');
})();
