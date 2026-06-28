/* ============================================================
   ADEPTIO · v2.4.5 — the APPROVALS spine  (window.APPROVALS)  · T1
   ONE primitive over every request flow: request → checks → decision
   → outcome + audit. A protective check (OT cap · geofence · punch)
   sets grade = "flag" — it NEVER blocks, it routes to review. A new
   approvable type is config (register), not new code.
   Non-invasive: it READS db_workflow (the one store) and delegates
   decisions to DATA.approve / DATA.ret, so the existing L1/L2 + SW
   flows keep working unchanged — this just unifies the surface and
   adds the category buckets the inbox groups by. Node-safe.
   ============================================================ */
window.APPROVALS = (function () {
  // type registry — `cat` drives the inbox buckets, `protective` ⇒ failed check flags (never blocks)
  const TYPES = {
    Leave:      { label: "Leave request",     scope: "manager", protective: false, check: "balance",            cat: "leave" },
    Overtime:   { label: "Overtime",          scope: "manager", protective: true,  check: "≤3h/day · ≤45h/mo",  cat: "overtime" },
    Swap:       { label: "Shift swap",        scope: "manager", protective: true,  check: "OT guardrail",       cat: "shift" },
    Claim:      { label: "Open-shift claim",  scope: "manager", protective: true,  check: "OT guardrail",       cat: "shift" },
    Correction: { label: "Punch / correction",scope: "manager", protective: true,  check: "geofence",           cat: "shift" },
    Expense:    { label: "Expense / claim",   scope: "hr",      protective: false, check: "policy",             cat: "others" }
  };
  const CAT_ORDER = ["shift", "overtime", "leave", "others"];
  const CAT_LABEL = { shift: "On shift", overtime: "Overtime", leave: "Leave", others: "Others" };

  const wf = () => { try { return DB.list("db_workflow", "requests") || []; } catch (e) { return []; } };
  const catOf = (type) => (TYPES[type] && TYPES[type].cat) || "others";

  function inbox() { return wf().filter(r => r.status === "pending"); }
  function pending() { return inbox().length; }
  function get(id) { return wf().find(r => r.id === id) || null; }
  // grouped, in manager priority order (on-shift → overtime → leave → others)
  function buckets() {
    const b = {}; CAT_ORDER.forEach(c => b[c] = []);
    inbox().forEach(r => { (b[catOf(r.type)] || b.others).push(r); });
    return b;
  }
  // decide delegates to the existing engine so OT-quota / roster-rewrite hooks still fire
  function decide(id, decision) {
    try {
      if (decision === "approved" && window.DATA && DATA.approve) return DATA.approve(id);
      if (window.DATA && DATA.ret) return DATA.ret(id);
    } catch (e) {}
    return null;
  }
  function request(type, detail, extra) { try { return (window.DATA && DATA.submitRequest) ? DATA.submitRequest(type, detail, extra) : null; } catch (e) { return null; } }
  // a new approvable type by CONFIG (e.g. T3 registers "Advance")
  function register(def) {
    TYPES[def.key] = { label: def.label, scope: def.scope || "manager", protective: !!def.protective, check: def.check || "—", cat: def.cat || "others" };
    try { if (window.DB && DB.audit) DB.audit("system", "approve.type_registered", def.key, "console"); } catch (e) {}
    return TYPES[def.key];
  }
  return { TYPES, CAT_ORDER, CAT_LABEL, catOf, inbox, pending, get, buckets, decide, request, register };
})();
