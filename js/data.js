/* ============================================================
   ADEPTIO · v2.3.2.db — DATA, now a thin lens over window.DB
   v2.3.1 shipped this file as an in-memory demo store; v2.3.2.db
   replaces the arrays with live reads from the split data layer
   (js/db.js). Same public surface — screens did not change their
   contract — but every collection is now persisted per store,
   every mutation lands in exactly one store and becomes a fact
   on db_audit (§05 sync path). Both tiers run on the same DB.
   ============================================================ */
window.DATA = (function () {

  const company = {
    name: "Phou Ngern Group",
    tier: "Professional · ≤250 seats",
    headcount: 248,
    presentPct: 95.1,
    get divisions() { return DB.list("db_people", "divisions"); }
  };

  // Who you are, per persona lens.
  // v2.3.2.db: the STAFF lens is no longer hard-coded — it reads the acting
  // user from db_people, switchable from any Staff screen (and persisted).
  // New hires are selectable the moment their row lands in the store.
  const ME_KEY = "adeptio.v232.actingStaff";
  let actingStaffId = "EMP-0214";
  try { if (typeof localStorage !== "undefined" && localStorage.getItem(ME_KEY)) actingStaffId = localStorage.getItem(ME_KEY); } catch (e) { /* node / blocked storage */ }

  function actingStaff() {
    const emp = DB.list("db_people", "employees");
    const e = emp.find(x => x.id === actingStaffId) || emp.find(x => x.id === "EMP-0214") || emp[0];
    if (!e) return { name: "No staff on file", id: "—", role: "—", site: "Vientiane Plant 1", attend: 0, leaveBal: 0, ot: 0, div: "—", team: "—", pos: "—", since: "—" };
    return {
      name: e.name, id: e.id, site: "Vientiane Plant 1",
      role: e.pos + " · " + e.div + (e.team && e.team !== "—" ? " " + e.team : ""),
      attend: e.attend, leaveBal: e.leaveBal, ot: e.ot,
      div: e.div, team: e.team, pos: e.pos, since: e.since, status: e.status || "active"
    };
  }
  const shortName = (n) => { const p = String(n).split(" "); return p[0] + (p[1] ? " " + p[1][0] + "." : ""); };

  const me = {
    get staff() { return actingStaff(); },
    manager:  { name: "Khamla Sisouphanh",      id: "EMP-0098", role: "Supervisor · Production Line A", team: "Production Line A" },
    hr:       { name: "Vilayvanh Chanthavong",  id: "EMP-0021", role: "HR Operations Lead" },
    ceo:      { name: "Phonesavanh Luangrath",  id: "EMP-0001", role: "Chief Executive · Shareholder" },
    sysadmin: { name: "Thip Norasing",          id: "ADM-0002", role: "Platform Administrator" }
  };

  function setActingStaff(id) {
    actingStaffId = id;
    try { if (typeof localStorage !== "undefined") localStorage.setItem(ME_KEY, id); } catch (e) {}
    DB.audit("system", "session.staff_lens", id + " · " + actingStaff().name, "demo");
    notify();
  }

  /* ---------- live state (UI-session state; records live in DB) ---------- */
  const state = {
    clockedIn: true, clockIn: "08:30",
    lang: "en",
    get sent() { return DB.list("db_comms", "messages"); }, // comms log lives in db_comms now
    // Tier flag — R4 "flags, not forks": one codebase, gated per tier.
    tier: (typeof location !== "undefined" && /tier=professional/.test(location.search)) ? "professional" : "essential"
  };

  /* ---------- tier gates (Blueprint §13 — unlocks-at) ---------- */
  const GATES = {
    deviceCapture: "growth", l2: "growth", vault: "growth", broadcastEmail: "growth",
    scheduledReports: "growth", docRequests: "growth", fullMss: "growth",
    ceo: "professional", sysadmin: "professional", sms: "professional",
    segmentation: "professional", delegation: "professional", analytics: "professional",
    bulkDocs: "professional", execPack: "professional", customCms: "professional",
    // v2.4.2 — biometric & gate integration (Pro + Enterprise split)
    biometrics: "professional",                 // device capture + biometric terminals
    gates: "enterprise", deviceCloud: "enterprise", customDevice: "enterprise", // gates · cloud OpenAPI · custom webhook
    webhook: "enterprise", esign: "enterprise", sso: "enterprise"
  };
  const TIER_LABELS = { growth: "Growth · ≤100", professional: "Professional · ≤250", enterprise: "Enterprise · ≤600" };
  function has(flag) {
    // v2.4.5 — tier-licensing is its own subsystem and SHIPS OFF. When disabled,
    // every feature is available (gate ③ = true); only when an owner enables
    // licensing does the Essential/Pro tier cap below apply (v2.4.4 behaviour).
    if (window.LICENSE && !window.LICENSE.enabled) return true;
    const gate = GATES[flag];
    if (!gate) return true;
    if (state.tier === "professional") return gate !== "enterprise";
    return false; // essential: every gated flag is locked
  }
  const unlockLabel = (flag) => TIER_LABELS[GATES[flag]] || "Growth · ≤100";
  function setTier(t) {
    state.tier = t;
    DB.audit("system", "tenant.tier_flag", t + " (preview)", "—");
    notify();
  }

  /* ---------- tier-aware org numbers — read from dw_reports (L-DR) ----------
     On Essential (the pilot site = the actual db_people roster) the head-
     count, presence and division staff numbers are DERIVED LIVE from the
     employees table — hire or offboard someone and every KPI moves.
     Pro keeps the 248-org snapshot (directory shows the pilot sample). */
  function org() {
    const snaps = DB.list("dw_reports", "org_snapshots");
    const snap = snaps.find(s => s.tier === state.tier) || snaps[0];
    if (!snap || state.tier !== "essential") return snap;
    const emp = DB.list("db_people", "employees");
    const c = (st) => emp.filter(e => e.state === st).length;
    const present = c("present");
    return {
      ...snap,
      headcount: emp.length, present, late: c("late"), absent: c("absent"), onleave: c("onleave"),
      presentPct: emp.length ? (Math.round(present / emp.length * 1000) / 10).toFixed(1) + "%" : "—",
      runStaff: emp.length, broadcast: emp.length,
      divisions: snap.divisions.map(d => ({ ...d, staff: emp.filter(e => e.div === d.name).length }))
    };
  }
  const series = (id) => DB.list("dw_reports", "series").find(s => s.id === id) || { values: [0], labels: [], actual: [0], budget: [0] };

  /* ---------- tiny pub/sub ---------- */
  const subs = [];
  function notify() { subs.forEach(fn => fn()); }

  /* ---------- ledger mutations — each writes exactly ONE store (R1) ---------- */
  function approve(id) {
    const r = DB.list("db_workflow", "requests").find(x => x.id === id);
    if (!r) return;
    if (r.stage.startsWith("L1") && r.type === "Claim" && has("l2")) {
      r.stage = "L2 · HR / Finance"; // multi-step chain (Growth+)
    } else {
      r.status = "approved"; r.stage = "Recorded"; r.sla = "—"; // single-step on Essential
    }
    DB.persist("db_workflow");
    DB.audit("Khamla S.", r.type.toLowerCase() + ".approved", r.id, "10.0.7.31");
    // v2.4.3 — approving an OT request consumes the division's live quota (OT cell)
    try { if (r.status === "approved" && window.OT && OT.onRequestApproved) OT.onRequestApproved(r); } catch (e) { /* OT cell optional */ }
    // v2.4.4 — approving a Swap (SW) request updates the roster (Schedule cell)
    try { if (r.status === "approved" && r.type === "Swap" && window.SCHEDULE && SCHEDULE.onRequestApproved) SCHEDULE.onRequestApproved(r); } catch (e) { /* Schedule cell optional */ }
    // v2.4.5 G5 — approving an Advance (EWA) marks it for recovery on the next pay-run close (Payroll depth)
    try { if (r.status === "approved" && r.type === "Advance" && window.PAY && PAY.onRequestApproved) PAY.onRequestApproved(r); } catch (e) { /* Payroll cell optional */ }
    notify();
  }
  function ret(id) {
    const r = DB.list("db_workflow", "requests").find(x => x.id === id);
    if (!r) return;
    r.status = "returned"; r.stage = "Returned to staff"; r.sla = "—";
    DB.persist("db_workflow");
    DB.audit("Khamla S.", r.type.toLowerCase() + ".returned", r.id, "10.0.7.31");
    notify();
  }
  function clock() {
    state.clockedIn = !state.clockedIn;
    const punches = DB.list("db_time", "punches");
    const who = shortName(me.staff.name);
    if (state.clockedIn) {
      state.clockIn = DB.now();
      DB.add("db_time", "punches", { id: "PN-" + Date.now().toString().slice(-4), emp: me.staff.id, date: "Wed, Jun 10", in: state.clockIn, out: "—", hours: "—", status: "ok" }, who);
    } else {
      const open = punches.find(p => p.emp === me.staff.id && p.out === "—");
      if (open) { open.out = DB.now(); DB.persist("db_time"); }
    }
    DB.audit(who, state.clockedIn ? "attendance.punch_in" : "attendance.punch_out", me.staff.id + " · GPS", "mobile");
    notify();
  }
  function submitRequest(type, detail, extra) {
    const prefix = { Leave: "LV", Overtime: "OT", Claim: "EX", Correction: "TC", Swap: "SW" }[type] || "RQ";
    const id = prefix + "-0" + (483 + DB.list("db_workflow", "requests").length);
    // v2.4.3 — carry emp + div so the OT loop and payroll can resolve the division
    const row = { id, type, who: me.staff.name, emp: me.staff.id, div: me.staff.div, detail, dates: "Jun 2026", status: "pending", stage: "L1 · Manager", sla: "48h", note: "Submitted from UI preview.", submitted: "Jun 10 · " + DB.now() };
    if (extra && typeof extra === "object") Object.assign(row, extra);
    DB.add("db_workflow", "requests", row, shortName(me.staff.name));
    notify();
    return id;
  }

  /* ---------- staff lifecycle — used by the UI actions AND the smoke test ---------- */
  function hireStaff(f) {
    // v2.4.5 G8 — enforce the open-tier seat cap (no-op unless an owner set maxUsers in Platform Settings)
    try { if (window.LICENSE && LICENSE.seatGuard) { const g = LICENSE.seatGuard(1); if (!g.ok) return { ok: false, blocked: true, msg: g.msg }; } } catch (e) {}
    const emp = DB.list("db_people", "employees");
    const next = emp.reduce((m, e) => Math.max(m, Number(String(e.id).replace(/\D/g, "")) || 0), 0) + 1;
    const id = "EMP-" + String(next).padStart(4, "0");
    DB.add("db_people", "employees", {
      id, name: f.name, pos: f.pos || "Staff", div: f.div || "Production", team: f.team || "—",
      state: "present", in: DB.now(), attend: 100, ot: 0, leaveBal: 15, since: "Jun 2026", status: "probation"
    }, "Vilayvanh C.");
    DB.audit("Vilayvanh C.", "employee.hired", id + " · " + f.name, "10.0.4.12");
    // the Leave cell reacts to the employee.hired fact (§05 event chain, simulated):
    DB.add("db_leave", "balances", { emp: id, name: shortName(f.name), annual: 15, sick: 30, taken: 0 }, "system");
    notify();
    return id;
  }
  // v2.4.5 G3 — HR edits the People record (db_people is the one writer). Sealed identity fields
  // (DOB · National ID) are NOT editable through here — they change only via the secured identity flow.
  function editStaff(id, patch, who) {
    const store = DB.raw("db_people"); const arr = store && store.employees;
    const e = arr && arr.find(x => x.id === id);
    if (!e) return { ok: false, err: "No such employee." };
    const FIELDS = ["name", "pos", "div", "team", "phone", "pemail", "manager", "start", "site"];
    let changed = 0;
    FIELDS.forEach(k => { if (patch && patch[k] != null && patch[k] !== "" && patch[k] !== e[k]) { e[k] = patch[k]; changed++; } });
    DB.persist("db_people");
    DB.audit(who || "Vilayvanh C.", "employee.profile_edited", id + " · " + changed + " field(s)", "console");
    notify();
    return { ok: true, changed, emp: e };
  }
  function offboardStaff(id) {
    const e = DB.list("db_people", "employees").find(x => x.id === id);
    DB.del("db_people", "employees", "id", id, "Vilayvanh C.");
    DB.del("db_leave", "balances", "emp", id, "system");
    DB.audit("Vilayvanh C.", "employee.offboarded", id + (e ? " · " + e.name : ""), "10.0.4.12");
    // v2.4.0.db.auth — exit checklist: the door key goes with the desk (account off + sessions revoked)
    try { if (window.AUTH && AUTH.onOffboard) AUTH.onOffboard(id, "Vilayvanh C."); } catch (err) { /* identity cell optional in old harnesses */ }
    if (actingStaffId === id) setActingStaff("EMP-0214"); else notify();
  }
  function reassignStaff(id, div, team, who) {
    const e = DB.list("db_people", "employees").find(x => x.id === id);
    if (!e) return false;
    if (div) e.div = div;
    if (team) e.team = team;
    DB.persist("db_people");
    DB.audit(who || "Vilayvanh C.", "employee.reassigned", `${id} → ${e.div} · team ${e.team}`, who === "Khamla S." ? "10.0.7.31" : "10.0.4.12");
    notify();
    return true;
  }
  const myPayslips = () => DB.list("db_payroll", "payslips").filter(p => p.emp === me.staff.id);
  const myDocs = () => DB.list("db_docs", "documents").filter(d => d.emp === me.staff.id);
  /* ---------- document generation (flow J · DOC-####) — writes a real db_docs row ---------- */
  function nextDocId() {
    const max = DB.list("db_docs", "documents").reduce((m, d) => Math.max(m, Number(String(d.id).replace(/\D/g, "")) || 0), 0);
    return "DOC-0" + (Math.max(max, 289) + 1); // continue the HR serial line (…DOC-0290+)
  }
  function generateDoc(f) {
    const id = nextDocId();
    DB.add("db_docs", "documents", { id, emp: f.emp || me.staff.id, name: f.name, kind: f.kind || "Letter", expiry: f.expiry || "—", status: f.status || "issued" }, f.who || shortName(me.staff.name));
    notify();
    return id;
  }
  function advanceRun(id) {
    const r = DB.list("db_payroll", "payroll_runs").find(x => x.id === id);
    if (!r || r.step >= 4) return;
    if (r.step === 2 && DB.policy("db_payroll") && DB.policy("db_payroll").prerun) {
      // §06 — payroll's extra belt: branch before money moves
      DB.backups.now(["db_payroll"], "pre-run", "Pre-run branch · " + r.id, "kernel");
    }
    r.step += 1;
    r.state = ["draft", "draft", "review", "approved", "disbursed"][r.step];
    DB.persist("db_payroll");
    DB.audit("Vilayvanh C.", "payroll.run." + r.state, r.id, "10.0.4.12");
    notify();
  }
  function sendComms(audience, channelsList, est) {
    DB.add("db_comms", "messages", { id: "MSG-0" + (88 + DB.list("db_comms", "messages").length), audience, ch: channelsList.join(" · "), est, ts: DB.now() }, "Vilayvanh C.");
    notify();
  }

  // On Essential (no L2), items staged for HR/Finance fall back to the manager's single-step queue
  const pendingL1 = () => DB.list("db_workflow", "requests").filter(r => r.status === "pending" && (r.stage.startsWith("L1") || (!has("l2") && r.stage.startsWith("L2"))));
  const pendingL2 = () => DB.list("db_workflow", "requests").filter(r => r.status === "pending" && r.stage.startsWith("L2"));
  const mine = () => DB.list("db_workflow", "requests").filter(r => r.who === me.staff.name);

  return {
    company, me, state,
    // collections — live views over the split stores (one writer each)
    get team()        { return DB.list("db_people", "employees").filter(e => e.team === "Line A"); },
    get employees()   { return DB.list("db_people", "employees"); },
    get requests()    { return DB.list("db_workflow", "requests"); },
    get payslips()    { return DB.list("db_payroll", "payslips"); },
    get payrollRuns() { return DB.list("db_payroll", "payroll_runs"); },
    get templates()   { return DB.list("db_comms", "templates"); },
    get channels()    { return DB.list("db_comms", "channels"); },
    get audit()       { return DB.list("db_audit", "events"); },
    get docs()        { return DB.list("db_docs", "documents"); },
    get burn()              { return series("burn"); },
    get attendanceTrend()   { return series("attendance_trend").values; },
    get sent()              { return DB.list("db_comms", "messages"); },
    approve, ret, clock, submitRequest, advanceRun, sendComms,
    pendingL1, pendingL2, mine, myPayslips, myDocs,
    hireStaff, offboardStaff, editStaff, reassignStaff, generateDoc, nextDocId,
    setActingStaff, actingStaffId: () => actingStaffId,
    has, unlockLabel, setTier, org,
    tier: () => state.tier,
    pulse: notify,
    subscribe(fn) { subs.push(fn); }
  };
})();
