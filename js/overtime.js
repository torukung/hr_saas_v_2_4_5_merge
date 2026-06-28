/* ============================================================
   ADEPTIO · v2.4.3 — the OT cell  (db_overtime, store 13)
   One writer for overtime quota + rate policy. The HR OT screens,
   the Manager queue context and the Staff OT request all read here;
   approving an OT request (DATA.approve → onRequestApproved) is the
   only thing that consumes a division's live quota. Node-safe so
   tools/smoke.js renders these screens too.
   ============================================================ */
window.OT = (function () {
  const pulse = () => { try { if (window.DATA && DATA.pulse) DATA.pulse(); } catch (e) {} };
  const audit = (who, act, obj, ip) => { try { if (window.DB && DB.audit) DB.audit(who, act, obj, ip || "console"); } catch (e) {} };
  const list = (t) => { try { return DB.list("db_overtime", t) || []; } catch (e) { return []; } };
  const persist = () => { try { DB.persist("db_overtime"); } catch (e) {} };

  const SCOPES = ["monthly", "yearly"];
  const quotas = () => list("quotas");
  const policy = () => list("policy")[0] || { weekday: 150, restday: 200, holiday: 300, night: 150, dailyCapH: 3, monthlyCapH: 45, rounding: "15 min" };

  function divisions() {
    try { const d = DB.list("db_people", "divisions"); if (d && d.length) return d.map(x => x.name); } catch (e) {}
    return [...new Set(quotas().map(q => q.div))];
  }
  const curPeriod = (scope) => scope === "yearly" ? "2026" : "Jun 2026";

  function quotaFor(div, scope) {
    scope = scope || "monthly";
    return quotas().find(q => q.div === div && q.scope === scope)
      || { id: "OQ-" + div, div, scope, period: curPeriod(scope), limit: 0, used: 0, pending: 0 };
  }
  const remaining = (q) => Math.max(0, (q.limit || 0) - (q.used || 0) - (q.pending || 0));
  const pct = (q) => q.limit ? Math.round(((q.used || 0) + (q.pending || 0)) / q.limit * 100) : 0;
  const usedPct = (q) => q.limit ? Math.round((q.used || 0) / q.limit * 100) : 0;
  const overBy = (q) => Math.max(0, (q.used || 0) + (q.pending || 0) - (q.limit || 0));
  const tone = (q) => { const p = pct(q); return p >= 100 ? "bad" : p >= 85 ? "warn" : "ok"; };

  function setLimit(div, scope, hours, who) {
    const arr = quotas();
    const h = Math.max(0, Math.round(Number(hours) || 0));
    let q = arr.find(x => x.div === div && x.scope === scope);
    if (!q) {
      q = { id: "OQ-" + String(div).slice(0, 3).toUpperCase() + "-" + (scope === "yearly" ? "Y" : "M"), div, scope, period: curPeriod(scope), limit: h, used: 0, pending: 0 };
      arr.unshift(q);
    } else q.limit = h;
    persist();
    audit(who || "Vilayvanh C.", "ot.quota_limit_set", div + " · " + scope + " → " + h + " h", "10.0.4.12");
    pulse();
    return q;
  }

  const parseHours = (detail) => { const m = String(detail || "").match(/([\d.]+)\s*h/i); return m ? Number(m[1]) : 0; };
  function divOfRequest(r) {
    if (r.div) return r.div;
    try { const e = DB.list("db_people", "employees").find(x => x.id === r.emp || x.name === r.who); return e ? e.div : null; } catch (e) { return null; }
  }

  /* hook — DATA.approve() calls this when a request flips to "approved" */
  function onRequestApproved(r) {
    if (!r || r.type !== "Overtime") return;
    const div = divOfRequest(r); if (!div) return;
    const h = parseHours(r.detail); if (!h) return;
    ["monthly", "yearly"].forEach(scope => {
      const arr = quotas();
      let q = arr.find(x => x.div === div && x.scope === scope);
      if (!q) q = setLimit(div, scope, 0, "system");
      q.used = (q.used || 0) + h;
      q.pending = Math.max(0, (q.pending || 0) - h);
    });
    persist();
    audit("system", "ot.quota_consumed", r.id + " · " + div + " · +" + h + " h", "workflow");
  }

  /* staff preview — would this OT request fit the division's monthly quota? */
  function check(div, hours) {
    const q = quotaFor(div, "monthly");
    const rem = remaining(q);
    return { ok: hours <= rem, remaining: rem, limit: q.limit, used: q.used, pending: q.pending, cap: policy().monthlyCapH };
  }

  function totals(scope) {
    scope = scope || "monthly";
    return divisions().reduce((a, d) => {
      const q = quotaFor(d, scope);
      a.limit += q.limit || 0; a.used += q.used || 0; a.pending += q.pending || 0;
      if (overBy(q) > 0) a.over.push({ div: d, by: overBy(q) });
      return a;
    }, { limit: 0, used: 0, pending: 0, over: [] });
  }
  const overDivisions = (scope) => totals(scope).over;

  return {
    SCOPES, quotas, policy, divisions, curPeriod,
    quotaFor, remaining, pct, usedPct, overBy, tone,
    setLimit, parseHours, onRequestApproved, check, totals, overDivisions
  };
})();
