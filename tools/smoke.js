/* Structural smoke test — renders every screen (web+mobile, all personas)
   without a browser and validates routing integrity. */
const fs = require("fs"), path = require("path");
const ROOT = process.argv[2];

global.window = global;
const code = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
eval(code("js/i18n.js"));
eval(code("js/ui.js"));
eval(code("js/db.js"));      // the split data layer (in-memory shim in node) — store 11 included
eval(code("js/api-config.js"));
eval(code("js/auth.js"));    // v2.4.1.edge.auth — the identity cell
eval(code("js/data.js"));
/* ==SEAM:CELLS== one eval() per new v2.4.5 cell, after its deps == */
eval(code("js/flags.js"));     // v2.4.5 T0 — feature flags
eval(code("js/license.js"));   // v2.4.5 T0 — tier licensing (default OFF)
eval(code("js/approvals.js")); // v2.4.5 T1 — approvals spine
eval(code("js/provision.js")); // v2.4.1 — import + delta-sync cell
eval(code("js/devices.js"));   // v2.4.2 — the devices cell (store 12: biometric & gate capture)
eval(code("js/overtime.js"));  // v2.4.3 — the OT cell (store 13: quota & rate policy)
eval(code("js/schedule.js"));      // v2.4.4 — the Schedule cell (store 14: shift periods · groups · roster · views)
eval(code("js/calendar-core.js")); // v2.4.4 — the one calendar engine (read-only lens)
eval(code("js/payroll.js"));   // v2.4.3 — the Payroll cell (components + tax_config)
eval(code("js/ledger.js"));    // v2.4.5 T2 — cashbook & ledger (db_ledger)
eval(code("js/payroll-depth.js")); // v2.4.5 T3 — lifecycle · leveling · ETD · EWA
eval(code("js/dbops.js"));         // v2.4.5 T7 — advanced DB ops
eval(code("js/profile.js"));       // v2.4.5 T4 — people profile
eval(code("js/leave-cal.js"));     // v2.4.5 T5 — leave & calendar
eval(code("js/mail.js"));          // v2.4.5 T6 — channels
eval(code("js/platform-owner.js"));// v2.4.5 T9 — platform owner gate
eval(code("js/backup.js"));        // v2.4.5 — full-split backup/restore
eval(code("js/screens/authviews.js"));
eval(code("js/screens/dbviews.js"));
eval(code("js/screens/reports.js"));
eval(code("js/screens/schedule.js")); // v2.4.4 — shared Job Schedule & shifts renderers (SCHEDVIEWS)
eval(code("js/screens/approvalsview.js")); // v2.4.5 T1 — shared unified inbox (APPROVALSVIEW)
for (const f of ["staff", "manager", "hr", "ceo", "sysadmin"]) eval(code("js/screens/" + f + ".js"));

const errors = [], warns = [];
const params = {
  "request-detail": "LV-0481", "payslip": "PS-2026-05", "request-new": "Claim",
  "approval": "EX-0210", "member": "EMP-0214", "person": "EMP-0214",
  "payroll-run": "PR-2026-06", "division": "Sales", "template": "TPL-023",
  "dbstore": "db_people", "data": "db_people", "report-run": "RPT-1010",
  "identity": "all", "outbox": "MAIL-0200",
  // v2.4.2 — device capture screens
  "device": "DEV-ZK01", "device-new": "zkteco", "gate": "GATE-01", "group": "GRP-PROD",
  // v2.4.4 — Job Schedule & shifts (all tolerate undefined; defaults exercise the param paths)
  "sched-cal": "month", "sched-staff": "all", "sched-manage": "2026-06-08", "sched-me": "month"
};
// v2.4.5 — tier licensing ships OFF (everything unlocked). The legacy suite below asserts the
// Essential/Pro/Enterprise gating, so enable licensing for it; the licensing-OFF default is
// checked explicitly near the end (device block).
LICENSE.toggle(true);
const screens = {}; // collect existing screen ids per persona/device

for (const [pk, P] of Object.entries(PERSONAS)) {
  screens[pk] = { web: new Set(Object.keys(P.web)), mobile: new Set(Object.keys(P.mobile)) };
}

let rendered = 0;
const allBodies = [];
for (const tier of ["essential", "professional"]) { // v2.3.1.essential — render every screen under both tier flags
  DATA.state.tier = tier;
  for (const [pk, P] of Object.entries(PERSONAS)) {
    for (const dev of ["web", "mobile"]) {
      for (const [sid, fn] of Object.entries(P[dev])) {
        try {
          const out = fn(params[sid]);
          if (!out || typeof out.body !== "string" || !out.body.length) { errors.push(`[${tier}] ${pk}/${dev}/${sid}: empty body`); continue; }
          if (dev === "web" && !out.title) errors.push(`[${tier}] ${pk}/${dev}/${sid}: missing title`);
          for (const bad of ["undefined", "[object Object]", "NaN"]) {
            if (out.body.includes(bad)) errors.push(`[${tier}] ${pk}/${dev}/${sid}: contains "${bad}"`);
            if (out.title && String(out.title).includes(bad)) errors.push(`[${tier}] ${pk}/${dev}/${sid}: title contains "${bad}"`);
          }
          allBodies.push([`[${tier}] ${pk}/${dev}/${sid}`, out.body + " " + (out.actions || "") + " " + JSON.stringify(out.crumbs || "")]);
          rendered++;
        } catch (e) { errors.push(`[${tier}] ${pk}/${dev}/${sid}: THROWS — ${e.message}`); }
      }
    }
  }
}
// tier-gate sanity
DATA.state.tier = "essential";
if (DATA.has("l2") || DATA.has("vault") || DATA.has("ceo")) errors.push("gates: essential should lock l2/vault/ceo");
DATA.state.tier = "professional";
if (!DATA.has("l2") || !DATA.has("sms") || DATA.has("webhook")) errors.push("gates: professional should open l2+sms, keep webhook enterprise-locked");

// validate every data-go target resolves
const goRe = /data-go="([^"]+)"/g;
for (const [where, html] of allBodies) {
  let m;
  while ((m = goRe.exec(html))) {
    const tgt = m[1];
    if (tgt === "launcher" || tgt === "login" || /^(activate|reset)\//.test(tgt)) continue; // portal routes (pre-session views)
    const [p, d, s] = tgt.split("/");
    if (!PERSONAS[p]) { errors.push(`${where}: data-go → unknown persona "${tgt}"`); continue; }
    if (d !== "web" && d !== "mobile") { errors.push(`${where}: data-go → bad device "${tgt}"`); continue; }
    if (!screens[p][d].has(s)) errors.push(`${where}: data-go → missing screen "${tgt}"`);
  }
}

// nav/tab targets + parents
for (const [pk, P] of Object.entries(PERSONAS)) {
  for (const g of P.nav) for (const it of g.items) if (!screens[pk].web.has(it.id)) errors.push(`${pk}: nav item "${it.id}" has no web screen`);
  for (const tb of P.tabs) if (!screens[pk].mobile.has(tb.id)) errors.push(`${pk}: tab "${tb.id}" has no mobile screen`);
  for (const [child, par] of Object.entries(P.parent || {})) if (!screens[pk].web.has(par)) errors.push(`${pk}: parent of ${child} → missing "${par}"`);
  for (const [child, par] of Object.entries(P.tabParent || {})) if (!screens[pk].mobile.has(par)) errors.push(`${pk}: tabParent of ${child} → missing "${par}"`);
}

// ledger demo integrity
DATA.approve("LV-0481");
const lv = DATA.requests.find(r => r.id === "LV-0481");
if (lv.status !== "approved") errors.push("ledger: approve(LV-0481) did not set approved");
if (DATA.audit[0].obj !== "LV-0481") warns.push("ledger: audit tail head is " + DATA.audit[0].obj);
DATA.approve("EX-0210"); // L1 claim → escalates? EX is already L2; settle
const ex = DATA.requests.find(r => r.id === "EX-0210");
if (ex.status !== "approved") errors.push("ledger: settle EX-0210 failed");
const id = DATA.submitRequest("Leave", "test");
if (!DATA.requests.find(r => r.id === id)) errors.push("ledger: submitRequest failed");
if (DATA.audit[0].obj !== id) warns.push("ledger: submit fact not at audit head");

/* ---------- v2.3.2.db — data layer integrity ---------- */
// CRUD roundtrip on db_people
const n0 = DB.rows("db_people");
DB.add("db_people", "employees", { id: "EMP-9999", name: "Smoke Test", pos: "QA", div: "Admin", team: "Line A", state: "present", in: "08:00", attend: 100, ot: 0, leaveBal: 9, since: "Jun 2026" });
if (DB.rows("db_people") !== n0 + 1) errors.push("db: add row failed");
if (!DATA.team.find(e => e.id === "EMP-9999")) errors.push("db: added Line A member not visible through DATA.team lens");
if (!DB.del("db_people", "employees", "id", "EMP-9999")) errors.push("db: delete row failed");
if (DB.rows("db_people") !== n0) errors.push("db: row count after delete mismatch");
// append-only audit ledger must refuse deletes
if (DB.del("db_audit", "events", "obj", "LV-0476") !== false) errors.push("db: audit ledger allowed a delete (must be append-only)");
// derived store must refuse direct writes
if (DB.add("dw_reports", "series", { id: "hack" }) !== null) errors.push("db: derived store accepted a direct write");
// backup → mutate → restore roundtrip (per-module blast radius)
const reqCount = DB.rows("db_workflow");
const bk = DB.backups.now(["db_workflow"], "manual", "smoke");
DB.add("db_workflow", "requests", { id: "ZZ-0001", type: "Leave", who: "Smoke", detail: "x", dates: "—", status: "pending", stage: "L1 · Manager", sla: "—", note: "", submitted: "—" });
const peopleBefore = JSON.stringify(DB.list("db_people", "employees"));
DB.backups.restore(bk.id, ["db_workflow"]);
if (DB.rows("db_workflow") !== reqCount) errors.push("db: restore did not rewind db_workflow");
if (JSON.stringify(DB.list("db_people", "employees")) !== peopleBefore) errors.push("db: restoring db_workflow touched db_people (blast radius breached)");
// selectable multi-store backup + export shape
const bk2 = DB.backups.now(["db_people", "db_payroll"], "manual", "smoke2");
if (bk2.stores.length !== 2) errors.push("db: selectable backup wrong store set");
const exp = DB.exportObj(["db_audit"]);
if (!exp.stores.db_audit || !exp.tenant) errors.push("db: export shape wrong");
// scheduler: policies fire once per window
DB.list("db_platform", "backup_policies").forEach(p => p.last = null);
const due1 = DB.tick();
if (!due1.length) errors.push("db: scheduler found nothing due on cold start");
if (DB.tick().length !== 0) errors.push("db: scheduler re-fired inside the same window");
// restore drill + dw rebuild
if (DB.drill().result !== "pass") errors.push("db: restore drill failed");
if (typeof DB.rebuildReports() !== "number") errors.push("db: dw_reports rebuild failed");
// docs store gated on essential (provisioned lazily)
DATA.state.tier = "essential";
if (DB.provisioned("db_docs")) errors.push("db: db_docs should not be provisioned on essential");
DATA.state.tier = "professional";
if (!DB.provisioned("db_docs")) errors.push("db: db_docs should be provisioned on professional");

/* ---------- staff lifecycle — add / assign / delete with live org KPIs ---------- */
DB.reset("db_people");
DATA.state.tier = "essential";
const hc0 = DATA.org().headcount;
if (hc0 < 30 || hc0 > 35) errors.push("staff: pilot roster should be 30–35 active staff, got " + hc0);
if (DATA.org().present + DATA.org().late + DATA.org().absent + DATA.org().onleave !== hc0) errors.push("staff: derived presence states don't sum to headcount");
DB.add("db_people", "employees", { id: "EMP-9001", name: "Lifecycle Test", pos: "QA", div: "Sales", team: "—", state: "present", in: "08:00", attend: 100, ot: 0, leaveBal: 15, since: "Jun 2026", status: "probation" });
if (DATA.org().headcount !== hc0 + 1) errors.push("staff: org headcount did not re-derive after hire");
const salesN = DB.list("db_people", "employees").filter(e => e.div === "Sales").length;
if (DATA.org().divisions.find(d => d.name === "Sales").staff !== salesN) errors.push("staff: division staff counts not derived live");
const e9 = DB.list("db_people", "employees").find(e => e.id === "EMP-9001");
e9.team = "Line A"; DB.persist("db_people"); // assign (what staff-assign / mgr-assign do)
if (!DATA.team.find(e => e.id === "EMP-9001")) errors.push("staff: team assignment not visible through DATA.team lens");
DB.del("db_people", "employees", "id", "EMP-9001"); // offboard
if (DATA.org().headcount !== hc0) errors.push("staff: offboard did not restore derived headcount");
DATA.state.tier = "professional";
if (DATA.org().headcount !== 248) errors.push("staff: professional snapshot should stay at the 248-org");

/* ---------- acting staff lens — new users selectable & usable EVERYWHERE ---------- */
DATA.state.tier = "essential";
const newId = DATA.hireStaff({ name: "Khamphone Soudavanh", pos: "Machine Operator", div: "Production", team: "Line A" });
if (!DATA.employees.find(e => e.id === newId)) errors.push("lens: hireStaff row missing in db_people");
if (!DB.list("db_leave", "balances").find(b => b.emp === newId)) errors.push("lens: leave balance not provisioned on hire (event chain)");
DATA.setActingStaff(newId);
if (DATA.me.staff.id !== newId || DATA.me.staff.name !== "Khamphone Soudavanh") errors.push("lens: acting staff did not switch to new user");
const rq = DATA.submitRequest("Leave", "annual leave · new user");
const rqRow = DATA.requests.find(r => r.id === rq);
if (!rqRow || rqRow.who !== "Khamphone Soudavanh") errors.push("lens: request not attributed to acting user");
if (!DATA.pendingL1().find(r => r.id === rq)) errors.push("lens: manager L1 queue does not see new user's request");
if (!DATA.mine().find(r => r.id === rq)) errors.push("lens: 'my requests' does not follow acting user");
if (DATA.myPayslips().length !== 0) errors.push("lens: brand-new user should have zero payslips");
if (!DATA.team.find(e => e.id === newId)) errors.push("lens: new Line A hire missing from manager team lens");
// every Staff screen must render cleanly for the brand-new user (no slips/docs/punches)
for (const dev of ["web", "mobile"]) {
  for (const [sid, fn] of Object.entries(PERSONAS.staff[dev])) {
    try {
      const out = fn(params[sid]);
      if (!out || !out.body || /undefined|NaN|\[object Object\]/.test(out.body)) errors.push(`lens: staff/${dev}/${sid} renders broken for new user`);
    } catch (e) { errors.push(`lens: staff/${dev}/${sid} THROWS for new user — ${e.message}`); }
  }
}
// cross-check: the new user is visible in every other lens that should list them
if (!PERSONAS.staff.web.home().actions.includes(newId)) errors.push("lens: user picker missing new user");
if (!PERSONAS.hr.web.people().body.includes(newId)) errors.push("lens: HR directory missing new user");
if (!PERSONAS.hr.web.person(newId).title.includes("Khamphone")) errors.push("lens: HR person page wrong for new user");
if (!PERSONAS.manager.web.team().body.includes(newId)) errors.push("lens: manager roster missing new user");
if (!PERSONAS.manager.web.overview().body.includes(newId)) errors.push("lens: manager team board missing new user");
if (!PERSONAS.staff.web.mydata().body.includes(rq)) errors.push("lens: My data missing new user's request");
// offboard: lens falls back safely, row gone everywhere
DATA.offboardStaff(newId);
if (DATA.me.staff.id === newId) errors.push("lens: acting user not reset after offboard");
if (PERSONAS.hr.web.people().body.includes(newId)) errors.push("lens: offboarded user still in HR directory");
DATA.setActingStaff("EMP-0214");
DB.reset("db_workflow");

/* ---------- reports — runs, last-3 visibility, file storage, dynamism ---------- */
// every persona has a report section; every catalog entry builds clean on both tiers
const REPORT_PERSONAS = ["staff", "manager", "hr", "ceo", "sysadmin"];
for (const tier of ["essential", "professional"]) {
  DATA.state.tier = tier;
  for (const persona of REPORT_PERSONAS) {
    if (!REP.ids(persona).length) errors.push(`report: persona ${persona} has no report section`);
    const lib = REP.library(persona, persona + "/web");
    if (!lib || /undefined|NaN|\[object Object\]/.test(lib)) errors.push(`report [${tier}]: ${persona} library renders broken`);
    for (const rid of REP.ids(persona)) {
      const m = REP.meta(rid);
      if (m.gate && !DATA.has(m.gate)) continue;
      const probe = [m.headline(), m.query()].join(" ") + JSON.stringify(m.kpis()) + JSON.stringify(m.rows());
      if (/undefined|NaN/.test(probe)) errors.push(`report [${tier}]: ${rid} computes broken values`);
    }
  }
}
DATA.state.tier = "essential";
// seeded runs: last-3 visible, older archived (team-attendance seeds 4 runs)
const taRuns = DB.reports.runs("team-attendance");
if (taRuns.filter(r => !r.archived).length !== 3) errors.push("report: seeded team-attendance should show exactly 3 visible runs");
if (!taRuns.find(r => r.archived)) errors.push("report: seeded team-attendance should have an archived run in file storage");
// generate: a new run is saved, becomes head, pushes the 3rd into the archive
const visBefore = DB.reports.runs("team-attendance").filter(r => !r.archived).map(r => r.id);
const newRun = REP.generate("team-attendance");
if (!newRun || DB.reports.runs("team-attendance")[0].id !== newRun.id) errors.push("report: generate did not save the run at head");
const visAfter = DB.reports.runs("team-attendance").filter(r => !r.archived);
if (visAfter.length !== 3) errors.push("report: visibility window must stay at 3 after generate");
if (visAfter.map(r => r.id).includes(visBefore[2])) errors.push("report: oldest visible run should have moved to file storage");
// dynamism: a new hire appears in the NEXT generated run, not the stored one
const dynId = DATA.hireStaff({ name: "Report Dynamic", pos: "Packer", div: "Production", team: "Line A" });
if (JSON.stringify(newRun.rows).includes(dynId)) errors.push("report: stored run must be a frozen snapshot");
const dynRun = REP.generate("team-attendance");
if (!JSON.stringify(dynRun.rows).includes(dynId)) errors.push("report: new run not dynamic to new hire");
if (!REP.runPage(dynRun.id, "manager", "manager/web").body.includes(dynId)) errors.push("report: run viewer missing new hire");
// file storage: folders per report, archived files listed, delete works
const fp = REP.filesPage("manager", "manager/web");
if (!fp.folders.includes("reports/" + DB.TENANT + "/team-attendance/")) errors.push("report: file storage missing per-report folder path");
const arch = DB.reports.runs("team-attendance").find(r => r.archived);
if (!arch || !fp.folders.includes(arch.id)) errors.push("report: archived run not listed in file storage");
if (!DB.reports.remove(arch.id)) errors.push("report: expire from storage failed");
if (DB.reports.runs().find(r => r.id === arch.id)) errors.push("report: expired run still present");
// gating: executive blocked on essential, open on pro
if (REP.generate("executive") !== null) errors.push("report: executive should refuse to generate on essential");
DATA.state.tier = "professional";
if (!REP.generate("executive")) errors.push("report: executive should generate on professional");
DATA.state.tier = "essential";
DATA.offboardStaff(dynId);
DB.reset("dw_reports"); // restore seeded runs for a clean slate

/* ---------- v2.4.2 — device capture (BioMetric & Gate) ---------- */
DATA.state.tier = "professional";
if (typeof DEVICES === "undefined") errors.push("devices: DEVICES cell not loaded");
else {
  if (DB.rows("db_devices") < 1) errors.push("devices: db_devices store not seeded");
  if (DEVICES.devices().length !== 8) warns.push("devices: expected 8 seeded devices, got " + DEVICES.devices().length);
  if (DEVICES.gates().length !== 5) warns.push("devices: expected 5 seeded gates, got " + DEVICES.gates().length);
  if (DEVICES.groups().length !== 4) warns.push("devices: expected 4 capture groups, got " + DEVICES.groups().length);
  const c = DEVICES.statusCounts();
  if (c.total !== DEVICES.devices().length) errors.push("devices: statusCounts total mismatch");
  if (DEVICES.uptime() < 0 || DEVICES.uptime() > 100) errors.push("devices: uptime out of range");
  const cs = DEVICES.clockSeries5m();
  if (!cs.data || cs.data.length !== 24) errors.push("devices: clockSeries5m should have 24 five-min frames");
  if (!(cs.total > 0)) errors.push("devices: clockSeries5m total should be > 0");
  const pctsum = DEVICES.captureMix().reduce((s, m) => s + m.pct, 0);
  if (pctsum < 96 || pctsum > 104) warns.push("devices: capture mix pct sum = " + pctsum);
  // CRUD: device add / remove
  const dN = DEVICES.devices().length;
  const newDev = DEVICES.addDevice({ vendor: "zkteco", zone: "Smoke gate", ad: true });
  if (DEVICES.devices().length !== dN + 1 || !DEVICES.deviceById(newDev)) errors.push("devices: addDevice did not persist");
  DEVICES.removeDevice(newDev);
  if (DEVICES.devices().length !== dN) errors.push("devices: removeDevice did not restore count");
  // groups: add / assign / primary (one person → one group)
  const gN = DEVICES.groups().length;
  const newG = DEVICES.addGroup({ name: "Smoke group", primary: "card" });
  if (DEVICES.groups().length !== gN + 1) errors.push("devices: addGroup failed");
  DEVICES.assignStaff(newG, "EMP-0214");
  if (!(DEVICES.groupById(newG).members || []).includes("EMP-0214")) errors.push("devices: assignStaff failed");
  if (!DEVICES.groupOf("EMP-0214") || DEVICES.groupOf("EMP-0214").id !== newG) errors.push("devices: groupOf did not follow the move");
  DEVICES.setPrimary(newG, "mobile");
  if (DEVICES.groupById(newG).primary !== "mobile") errors.push("devices: setPrimary failed");
  // identity bind toggle + gate state
  const dev0 = DEVICES.devices()[0], a0 = dev0.auth;
  DEVICES.toggleBind(dev0.id);
  if (DEVICES.deviceById(dev0.id).auth === a0) errors.push("devices: toggleBind did not flip identity binding");
  DEVICES.toggleBind(dev0.id);
  DEVICES.setGateState("GATE-01", "held");
  if (DEVICES.gateById("GATE-01").state !== "held") errors.push("devices: setGateState failed");
  DEVICES.setGateState("GATE-01", "secured");
  // new screens render clean on professional
  for (const [pk, sid] of [["sysadmin", "biometrics"], ["sysadmin", "devmonitor"], ["sysadmin", "gates"], ["sysadmin", "device"], ["sysadmin", "gate"], ["sysadmin", "device-new"], ["hr", "clocking"], ["hr", "group"]]) {
    const fn = PERSONAS[pk].web[sid];
    if (typeof fn !== "function") { errors.push(`devices: ${pk}/web/${sid} screen missing`); continue; }
    try { const out = fn(params[sid]); if (!out || !out.body || /undefined|NaN|\[object Object\]/.test(out.body)) errors.push(`devices: ${pk}/web/${sid} renders broken`); }
    catch (e) { errors.push(`devices: ${pk}/web/${sid} THROWS — ${e.message}`); }
  }
}
// tier split: biometrics = Professional · gates/cloud/custom = Enterprise.
// v2.4.5 — tier gating ONLY applies when licensing is ON (it ships OFF). Enable it for this
// check so the Essential/Pro/Enterprise logic is exercised, then restore the default OFF.
LICENSE.toggle(true);
DATA.state.tier = "essential";
if (DEVICES.has("biometrics")) errors.push("devices: biometrics should be locked on essential");
DATA.state.tier = "professional";
if (!DEVICES.has("biometrics")) errors.push("devices: biometrics should unlock on professional");
if (DEVICES.has("gates") || DEVICES.has("customDevice") || DEVICES.has("deviceCloud")) errors.push("devices: gates/cloud/custom should stay Enterprise-locked");
// v2.4.5 — with licensing OFF (the default), tier no longer gates: everything is available
LICENSE.toggle(false);
if (!DEVICES.has("biometrics") || !DEVICES.has("gates")) errors.push("v2.4.5: licensing OFF should unlock every tier-gated feature");
DB.reset("db_devices"); // restore the seeded fleet after CRUD
DATA.state.tier = "essential";

console.log(`rendered ${rendered} screens across ${Object.keys(PERSONAS).length} personas ×2 devices`);
if (warns.length) console.log("WARN:\n  " + warns.join("\n  "));
if (errors.length) { console.log("FAIL:\n  " + errors.join("\n  ")); process.exit(1); }
console.log("ALL CHECKS PASS");
