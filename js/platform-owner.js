/* ============================================================
   ADEPTIO · v2.4.5 — Platform Owner gate  (window.PLATOWNER)  · T9
   The root of trust for the owner-gated Platform Settings console:
   a config lock keyed to specific Gmail accounts. Only an owner may
   change tier/licensing, open-tier limits or channel keys, or flip
   the lock. Extends nothing it doesn't own — LICENSE already carries
   `locked` + `openLimits`; this adds the owner allowlist + the gate.
   Node-safe.
   ============================================================ */
window.PLATOWNER = (function () {
  const state = { gmails: ["pathom.bot@gmail.com", "owner@phoungern.la"], config_locked: false };
  const audit = (who, act, ref) => { try { if (window.DB && DB.audit) DB.audit(who || "owner", act, ref, "console"); } catch (e) {} };
  const pulse = () => { try { if (window.DATA && DATA.pulse) DATA.pulse(); } catch (e) {} };

  const gmails = () => state.gmails.slice();
  const isOwner = (email) => !!email && state.gmails.map(g => g.toLowerCase()).includes(String(email).toLowerCase());
  const locked = () => state.config_locked;
  // the gate every config write checks
  function canConfigure(email) { return isOwner(email) && !state.config_locked; }
  function setLock(v, who) { state.config_locked = !!v; audit(who, "owner.config_lock", v ? "locked" : "unlocked"); pulse(); }
  function addOwner(email, who) { if (email && !isOwner(email)) { state.gmails.push(email); audit(who, "owner.allowlist_add", email); pulse(); } return gmails(); }
  function removeOwner(email, who) { if (state.gmails.length > 1) state.gmails = state.gmails.filter(g => g.toLowerCase() !== String(email).toLowerCase()); audit(who, "owner.allowlist_remove", email); pulse(); return gmails(); }
  // current acting account's email (best-effort) — used to decide read-only vs editable in the console
  function actingEmail() { try { return (window.AUTH && AUTH.currentEmail && AUTH.currentEmail()) || (window.DATA && DATA.me && DATA.me.staff && DATA.me.staff.email) || "owner@phoungern.la"; } catch (e) { return ""; } }
  return { gmails, isOwner, locked, canConfigure, setLock, addOwner, removeOwner, actingEmail, state };
})();
