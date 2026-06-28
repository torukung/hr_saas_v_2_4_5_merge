/* ============================================================
   ADEPTIO · v2.4.5 — the FLAGS cell  (window.FLAGS)  · T0 gating
   Per-feature on/off, functional (not commercial — that's LICENSE).
   OFF = hide the menu + pause the engine, DATA RETAINED. Scope-guarded:
   a higher-scope flag can't be flipped by a lower role. CORE features
   are always on (no toggle). Single-tenant (no tenant dimension).
   Node-safe: guards window.* so smoke renders too.
   ============================================================ */
window.FLAGS = (function () {
  // optional features: scope = who may toggle · hides = nav ids to drop per persona when OFF
  const REGISTRY = {
    accounting: { label: "Accounting · cashbook & ledger", scope: "sys", def: true, hides: { hr: ["cashbook", "costbenefit"] } },
    dwreports:  { label: "DW reports & export",              scope: "sys", def: true },
    leveling:   { label: "Compliance leveling L0–L3",        scope: "sys", def: true, hides: { hr: ["leveling"] } },
    etd:        { label: "Earned-to-date tracker",           scope: "hr",  def: true },
    ewa:        { label: "Advances (EWA)",                   scope: "hr",  def: false, hides: { hr: ["advances"], staff: ["advance"] } },
    mail:       { label: "Mail / SMTP gateway",              scope: "sys", def: true },
    sms:        { label: "SMS channel",                      scope: "sys", def: false },
    line:       { label: "LINE channel",                     scope: "sys", def: false },
    whatsapp:   { label: "WhatsApp channel",                 scope: "sys", def: false },
    profile2:   { label: "People profile (SF-style)",        scope: "sys", def: true, hides: { hr: ["profile-view"] } },
    timeoff:    { label: "Time-off & team calendar",         scope: "sys", def: true, hides: { hr: ["holidays"] } },
    geofence:   { label: "Geofence on punch",                scope: "manager", def: true },
    selfie:     { label: "Selfie capture",                   scope: "manager", def: true },
    shiftswap:  { label: "Shift swap & open-shift",          scope: "manager", def: true },
    scheduling: { label: "Scheduling / roster",              scope: "manager", def: true }
  };
  const ORDER = Object.keys(REGISTRY);
  const CORE = [
    ["punch", "Clock in/out · attendance"], ["leave", "Leave request & balance"],
    ["payroll", "Payroll core · NSSF + PIT"], ["approvals", "Approvals spine"],
    ["identity", "Identity · access & security"], ["audit", "Audit log + backup"]
  ];
  const SCOPE_RANK = { manager: 1, hr: 2, sys: 3 };
  const state = {}; ORDER.forEach(k => state[k] = REGISTRY[k].def);

  const pulse = () => { try { if (window.DATA && DATA.pulse) DATA.pulse(); } catch (e) {} };
  const audit = (act, ref) => { try { if (window.DB && DB.audit) DB.audit("Thip N.", act, ref, "console"); } catch (e) {} };

  function on(feature) { return REGISTRY[feature] ? !!state[feature] : true; } // unknown/core ⇒ on
  function set(feature, val, callerScope) {
    const reg = REGISTRY[feature];
    if (!reg) return { ok: false, err: "Unknown feature." };
    if ((SCOPE_RANK[reg.scope] || 3) > (SCOPE_RANK[callerScope] || 0)) return { ok: false, err: reg.scope + "-scope flag — your role can't change this." };
    state[feature] = (val == null) ? !state[feature] : !!val;
    audit("flag.set", feature + " = " + (state[feature] ? "on" : "off")); pulse();
    return { ok: true, on: state[feature] };
  }
  // nav ids to hide for a persona because their feature is OFF (data retained underneath)
  function hiddenScreens(persona) {
    const s = new Set();
    ORDER.forEach(k => { if (!on(k) && REGISTRY[k].hides && REGISTRY[k].hides[persona]) REGISTRY[k].hides[persona].forEach(id => s.add(id)); });
    return s;
  }
  return { REGISTRY, ORDER, CORE, on, set, hiddenScreens, state };
})();
