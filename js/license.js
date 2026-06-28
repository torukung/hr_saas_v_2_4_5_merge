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
  const pulse = () => { try { if (window.DATA && DATA.pulse) DATA.pulse(); } catch (e) {} };
  const audit = (act, ref) => { try { if (window.DB && DB.audit) DB.audit("Thip N.", act, ref, "console"); } catch (e) {} };

  function toggle(on) {
    if (state.locked) return { ok: false, err: "Licensing is locked by the platform owner." };
    state.enabled = (on == null) ? !state.enabled : !!on;
    audit("license.toggled", state.enabled ? "on" : "off"); pulse();
    return { ok: true, enabled: state.enabled };
  }
  function setLock(v) { state.locked = !!v; audit("license.locked", v ? "on" : "off"); pulse(); }
  function setTier(t) { try { if (window.DATA && DATA.setTier) DATA.setTier(t); } catch (e) {} audit("license.tier_set", t); pulse(); }
  function tier() { try { return (window.DATA && DATA.tier) ? DATA.tier() : "essential"; } catch (e) { return "essential"; } }
  function setLimit(k, v) { if (k in state.openLimits) { state.openLimits[k] = (v === "" || v == null) ? null : (isNaN(+v) ? v : +v); audit("license.limit", k + "=" + v); pulse(); } }
  // the third gate — when licensing is OFF, everything the role+flags allow is available
  function allows(feature) { if (!state.enabled) return true; try { return (window.DATA && DATA.has) ? DATA.has(feature) : true; } catch (e) { return true; } }

  return {
    get enabled() { return state.enabled; },
    get locked() { return state.locked; },
    openLimits: state.openLimits,
    toggle, setLock, setTier, tier, setLimit, allows, state
  };
})();
