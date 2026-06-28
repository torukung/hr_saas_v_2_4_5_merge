/* ============================================================
   ADEPTIO · v2.4.4 — the SCHEDULE cell  (db_schedule, store 14)
   The roster's one writer. Shift periods (Mon–Sun × 24h), people
   groups (position · division · individual · manual), shift-group
   bindings, the published roster and saved per-account calendar
   views all live here. The calendar core (js/calendar-core.js) is
   a READ-ONLY lens — it reads db_time / db_leave / db_overtime /
   db_people through this cell and never copies them. Division stays
   on the person (db_people) — never duplicated into db_schedule.
   Approving a Swap (SW) request in db_workflow is the only thing
   that re-writes the roster (DATA.approve → onRequestApproved).
   Node-safe: guards window.* so tools/smoke.js renders these too.
   ============================================================ */
window.SCHEDULE = (function () {
  const pulse = () => { try { if (window.DATA && DATA.pulse) DATA.pulse(); } catch (e) {} };
  const audit = (who, act, obj, ip) => { try { if (window.DB && DB.audit) DB.audit(who, act, obj, ip || "console"); } catch (e) {} };
  const list = (t) => { try { return DB.list("db_schedule", t) || []; } catch (e) { return []; } };
  const persist = () => { try { DB.persist("db_schedule"); } catch (e) {} };
  const people = (t) => { try { return DB.list("db_people", t) || []; } catch (e) { return []; } };
  const me = () => { try { return (window.DATA && DATA.me && DATA.me.staff) || {}; } catch (e) { return {}; } };

  /* ---------- reads — the four roster objects ---------- */
  const periods = () => list("shift_periods");
  const period = (id) => periods().find(p => p.id === id) || null;
  const groups = () => list("groups");
  const group = (id) => groups().find(g => g.id === id) || null;
  const shiftGroups = () => list("shift_groups");
  const shiftGroup = (id) => shiftGroups().find(s => s.id === id) || null;

  function groupMembers(gid) {
    const g = group(gid); if (!g) return [];
    const emp = people("employees");
    return (g.members || []).map(id => emp.find(e => e.id === id)).filter(Boolean);
  }
  function divisions() {
    const d = people("divisions");
    if (d && d.length) return d.map(x => x.name);
    return [...new Set(groups().map(g => g.div).filter(Boolean))];
  }
  const empById = (id) => people("employees").find(e => e.id === id) || null;
  const empName = (id) => { const e = empById(id); return e ? e.name : id; };

  /* ---------- roster ---------- */
  function roster(filter) {
    let r = list("roster");
    if (!filter) return r;
    if (filter.from) r = r.filter(x => x.date >= filter.from);
    if (filter.to) r = r.filter(x => x.date <= filter.to);
    if (filter.date) r = r.filter(x => x.date === filter.date);
    if (filter.sg) r = r.filter(x => x.sg === filter.sg);
    if (filter.emp) r = r.filter(x => x.emp === filter.emp);
    if (filter.status) r = r.filter(x => x.status === filter.status);
    return r;
  }
  // each row enriched with the person, shift-group, period & a display label
  function rosterForDate(dateISO) {
    return roster({ date: dateISO }).map(row => {
      const sgObj = shiftGroup(row.sg);
      const periodObj = sgObj ? period(sgObj.period) : null;
      return {
        ...row,
        person: empById(row.emp),
        sgObj, periodObj,
        label: (sgObj && sgObj.label) || (periodObj && periodObj.name) || row.sg
      };
    });
  }

  /* ---------- capacity (Shift-CAP) ---------- */
  function cap(sgId) {
    const sg = shiftGroup(sgId); const c = (sg && sg.cap) || 0;
    const assigned = roster({ sg: sgId }).length;
    return capShape(c, assigned);
  }
  function capForDate(sgId, dateISO) {
    const sg = shiftGroup(sgId); const c = (sg && sg.cap) || 0;
    const assigned = roster({ sg: sgId, date: dateISO }).length;
    return capShape(c, assigned);
  }
  function capShape(c, assigned) {
    const free = Math.max(0, c - assigned);
    const pct = c ? Math.round(assigned / c * 100) : (assigned ? 100 : 0);
    const tone = assigned > c ? "bad" : pct >= 100 ? "warn" : "ok";
    return { cap: c, assigned, free, pct, tone };
  }

  /* ---------- id minting (SP- / G- / SG- / R-) ---------- */
  function nextId(arr, prefix, pad) {
    const max = arr.reduce((m, x) => Math.max(m, Number(String(x.id).replace(/\D/g, "")) || 0), 0);
    return prefix + String(max + 1).padStart(pad || 2, "0");
  }

  /* ---------- mutations — Shift Control objects ---------- */
  function createPeriod(o, who) {
    const arr = periods();
    const row = {
      id: nextId(arr, "SP-", 2), name: o.name || "New period",
      kind: o.kind || "shift", start: o.start || "08:00", end: o.end || "17:00",
      days: o.days || ["Mon", "Tue", "Wed", "Thu", "Fri"], color: o.color || "hr", note: o.note || ""
    };
    DB.add("db_schedule", "shift_periods", row, who || "Vilayvanh C.");
    audit(who || "Vilayvanh C.", "schedule.period.row_added", row.id + " · " + row.name, "10.0.4.12");
    pulse(); return row;
  }
  function createGroup(o, who) {
    const arr = groups();
    const row = {
      id: nextId(arr, "G-", 2), name: o.name || "New group",
      kind: o.kind || "manual", div: o.div || "", members: o.members || []
    };
    DB.add("db_schedule", "groups", row, who || "Vilayvanh C.");
    audit(who || "Vilayvanh C.", "schedule.group.row_added", row.id + " · " + row.name, "10.0.4.12");
    pulse(); return row;
  }
  function createShiftGroup(o, who) {
    const arr = shiftGroups();
    const row = {
      id: nextId(arr, "SG-", 2), period: o.period || (periods()[0] || {}).id,
      group: o.group || (groups()[0] || {}).id, label: o.label || "New shift", cap: Number(o.cap) || 1
    };
    DB.add("db_schedule", "shift_groups", row, who || "Vilayvanh C.");
    audit(who || "Vilayvanh C.", "schedule.shift_group.row_added", row.id + " · " + row.label, "10.0.4.12");
    pulse(); return row;
  }

  /* ---------- roster mutations ---------- */
  function assign(dateISO, sgId, emp, who) {
    if (!dateISO || !sgId || !emp) return null;
    const arr = list("roster");
    if (arr.find(x => x.date === dateISO && x.sg === sgId && x.emp === emp)) return null; // no dup
    const row = { id: nextId(arr, "R-", 4), date: dateISO, sg: sgId, emp, status: "planned" };
    DB.add("db_schedule", "roster", row, who || "Khamla S.");
    audit(who || "Khamla S.", "schedule.assigned", row.id + " · " + empName(emp) + " → " + sgId + " · " + dateISO, "10.0.7.31");
    pulse(); return row;
  }
  function unassign(rosterId, who) {
    const r = list("roster").find(x => x.id === rosterId);
    DB.del("db_schedule", "roster", "id", rosterId, who || "Khamla S.");
    audit(who || "Khamla S.", "schedule.unassigned", rosterId + (r ? " · " + empName(r.emp) : ""), "10.0.7.31");
    pulse(); return !!r;
  }
  // publish a single row, an explicit id-list, or every row matching a filter
  function publish(target, who) {
    let rows;
    if (typeof target === "string") rows = list("roster").filter(x => x.id === target);
    else if (Array.isArray(target)) rows = list("roster").filter(x => target.includes(x.id));
    else rows = roster(target).filter(x => x.status !== "published");
    let n = 0;
    rows.forEach(r => { if (r.status !== "published") { r.status = "published"; n++; } });
    if (n) { persist(); audit(who || "Khamla S.", "schedule.published", n + " shift" + (n === 1 ? "" : "s"), "10.0.7.31"); pulse(); }
    return n;
  }

  /* ---------- division — stays on the PERSON (writes db_people) ---------- */
  function createDivision(name, who) {
    if (!name) return null;
    const divs = people("divisions");
    if (divs.find(d => d.name === name)) return null;
    const row = { name, head: "—", staff: 0 };
    try { DB.add("db_people", "divisions", row, who || "Vilayvanh C."); } catch (e) {}
    audit(who || "Vilayvanh C.", "schedule.division.created", name, "10.0.4.12");
    pulse(); return row;
  }
  function assignDivision(emp, div, who) {
    const e = empById(emp); if (!e) return false;
    e.div = div;
    try { DB.persist("db_people"); } catch (er) {}
    audit(who || "Vilayvanh C.", "schedule.division.assigned", emp + " → " + div, "10.0.4.12");
    pulse(); return true;
  }

  /* ---------- saved views (one default per owner) ---------- */
  function views(owner) {
    const v = list("views");
    return owner ? v.filter(x => x.owner === owner) : v;
  }
  function saveView(v, who) {
    const arr = list("views");
    const owner = v.owner || (me().email) || "owner";
    let row = v.id ? arr.find(x => x.id === v.id) : null;
    if (v.def) arr.forEach(x => { if (x.owner === owner) x.def = false; }); // one default per owner
    if (row) {
      Object.assign(row, { name: v.name != null ? v.name : row.name, perspective: v.perspective || row.perspective, scope: v.scope != null ? v.scope : row.scope, def: !!v.def });
      persist();
    } else {
      row = { id: nextId(arr, "VW-", 3), owner, name: v.name || "My view", perspective: v.perspective || "month", scope: v.scope != null ? v.scope : "all", def: !!v.def };
      DB.add("db_schedule", "views", row, who || "console");
    }
    audit(who || "console", "schedule.view.saved", row.id + " · " + row.name, "studio");
    pulse(); return row;
  }

  /* ---------- shift swap — a request in db_workflow (no new store) ---------- */
  function requestSwap(toEmp, dateISO, sgId, reason) {
    if (!window.DATA || !DATA.submitRequest) return null;
    const toName = empName(toEmp);
    const sg = shiftGroup(sgId);
    const detail = "Shift swap · " + dateISO + " → " + toName + (sg ? " · " + sg.label : "");
    return DATA.submitRequest("Swap", detail, { swap: { from: me().id, to: toEmp, date: dateISO, sg: sgId }, note: reason || "Requested from the calendar." });
  }
  /* hook — DATA.approve() calls this when a Swap request flips to "approved" */
  function onRequestApproved(r) {
    if (!r || r.type !== "Swap" || !r.swap) return;
    const sw = r.swap;
    const row = list("roster").find(x => x.date === sw.date && x.sg === sw.sg && x.emp === sw.from);
    if (!row) return; // defensive: the matched shift moved or was withdrawn — no-op
    row.emp = sw.to;
    persist();
    audit("system", "schedule.swap_applied", r.id + " · " + empName(sw.from) + " → " + empName(sw.to) + " · " + sw.date, "workflow");
  }

  /* ---------- status sets — read from the source stores (lens, never copy) ---------- */
  function leaveSet() {
    const s = new Set();
    people("employees").forEach(e => { if (e.state === "onleave") s.add(e.id); });
    try { DB.list("db_leave", "balances").forEach(b => {}); } catch (e) {}
    return s;
  }
  function sickSet() {
    const s = new Set();
    people("employees").forEach(e => { if (e.state === "sick") s.add(e.id); });
    return s;
  }
  function otSet() {
    const s = new Set();
    people("employees").forEach(e => { if ((e.ot || 0) > 0) s.add(e.id); });
    return s;
  }

  /* ---------- quick-view summary (the calendar header strip) ----------
     total = all staff · active = present · leave = on leave/sick ·
     available = active staff not yet rostered today · onShift = rostered today.
     Every number reads the source stores; nothing is duplicated. */
  function summary(filter) {
    const emp = people("employees");
    const total = emp.length;
    const active = emp.filter(e => e.state === "present" || e.state === "late").length;
    const leave = emp.filter(e => e.state === "onleave" || e.state === "sick").length;
    const day = (filter && filter.date) || (window.CALCORE && CALCORE.iso ? CALCORE.iso(new Date()) : "2026-06-08");
    const rostered = new Set(roster({ date: day }).map(r => r.emp));
    const onShift = rostered.size;
    const available = emp.filter(e => (e.state === "present" || e.state === "late") && !rostered.has(e.id)).length;
    return { total, active, leave, available, onShift };
  }

  return {
    periods, period, groups, group, shiftGroups, shiftGroup,
    groupMembers, divisions, empById, empName,
    roster, rosterForDate, cap, capForDate,
    createPeriod, createGroup, createShiftGroup,
    assign, unassign, publish,
    createDivision, assignDivision,
    views, saveView,
    requestSwap, onRequestApproved,
    summary, leaveSet, otSet, sickSet
  };
})();
