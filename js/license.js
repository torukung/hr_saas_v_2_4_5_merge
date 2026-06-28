/* ============================================================
   ADEPTIO · v2.4.5 — the LICENSE cell  (window.LICENSE)  · T0 gating
   Tier-licensing as its OWN switchable subsystem, separate from
   feature-flags. SHIPS DISABLED: license.enabled defaults FALSE, so
   the third gate of visible() is always true → nothing is tier-locked
   out of the box. Turning it on (Sys Admin ▸ Licensing) re-instates
   the v2.4.4 Essential/Pro behaviour, unchanged. Owner-lock + open-tier
   limits are carried here; the owner-gated Platform Settings console
   (T9) writes them. Node-safe: guards window.* so smoke renders too.
   ============================================================ */
window.LICENSE = (function () {
  const state = {
    enabled: false,                 // master switch — DEFAULT OFF (no tier licenses)
    locked: false,                  // owner safety latch — freezes enable/disable
    openLimits: { maxUsers: null, storageGB: null } // applied while licensing is OFF
  };
  // v2.4.5 G9 — persist/restore license state via db_platform.settings.license. openLimits is mutated
  // IN PLACE (it's exported by reference at the return below) — never reassigned. Node-safe (guards DB/DATA).
  const save = () => { try { if (window.DB && DB.platformSet) DB.platformSet("license", { enabled: state.enabled, locked: state.locked, tier: (window.DATA && DATA.tier) ? DATA.tier() : undefined, openLimits: { maxUsers: state.openLimits.maxUsers, storageGB: state.openLimits.storageGB } }); } catch (e) {} };
  try {
    const s = (window.DB && DB.platformGet) ? DB.platformGet("license") : null;
    if (s) {
      if (typeof s.enabled === "boolean") state.enabled = s.enabled;
      if (typeof s.locked === "boolean") state.locked = s.locked;
      if (s.openLimits) { state.openLimits.maxUsers = s.openLimits.maxUsers == null ? null : s.openLimits.maxUsers; state.openLimits.storageGB = s.openLimits.storageGB == null ? null : s.openLimits.storageGB; }
      if (s.tier && window.DATA && DATA.setTier) { try { DATA.setTier(s.tier); } catch (e) {} }
    }
  } catch (e) {}
  const pulse = () => { try { if (window.DATA && DATA.pulse) DATA.pulse(); } catch (e) {} };
  const audit = (act, ref) => { try { if (window.DB && DB.audit) DB.audit("Thip N.", act, ref, "console"); } catch (e) {} };

  function toggle(on) {
    if (state.locked) return { ok: false, err: "Licensing is locked by the platform owner." };
    state.enabled = (on == null) ? !state.enabled : !!on;
    save();
    audit("license.toggled", state.enabled ? "on" : "off"); pulse();
    return { ok: true, enabled: state.enabled };
  }
  function setLock(v) { state.locked = !!v; save(); audit("license.locked", v ? "on" : "off"); pulse(); }
  function setTier(t) { try { if (window.DATA && DATA.setTier) DATA.setTier(t); } catch (e) {} save(); audit("license.tier_set", t); pulse(); }
  function tier() { try { return (window.DATA && DATA.tier) ? DATA.tier() : "essential"; } catch (e) { return "essential"; } }
  function setLimit(k, v) { if (k in state.openLimits) { state.openLimits[k] = (v === "" || v == null) ? null : (isNaN(+v) ? v : +v); save(); audit("license.limit", k + "=" + v); pulse(); } }
  // the third gate — when licensing is OFF, everything the role+flags allow is available
  function allows(feature) { if (!state.enabled) return true; try { return (window.DATA && DATA.has) ? DATA.has(feature) : true; } catch (e) { return true; } }

  // v2.4.5 G8 — open-tier seat cap enforcement. seatGuard is a no-op when no cap is set
  // (openLimits.maxUsers == null, the shipped default), so default product behaviour is unchanged.
  function seatCount() { try { return (window.DATA && DATA.employees) ? DATA.employees.length : 0; } catch (e) { return 0; } }
  function seatGuard(adding) {
    const cap = state.openLimits.maxUsers;
    if (cap == null) return { ok: true };
    const have = seatCount(), want = have + (Number(adding) || 0);
    if (want > cap) return { ok: false, cap, have, msg: "Open-tier seat cap reached — " + have + " / " + cap + " seats used. Raise the cap in Platform Settings before adding more." };
    return { ok: true, cap, have, remaining: cap - have };
  }

  return {
    get enabled() { return state.enabled; },
    get locked() { return state.locked; },
    openLimits: state.openLimits,
    toggle, setLock, setTier, tier, setLimit, allows, seatCount, seatGuard, state
  };
})();
