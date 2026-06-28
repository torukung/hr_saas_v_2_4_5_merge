/* ============================================================
   ADEPTIO · v2.4.5 — Payroll DEPTH  (augments window.PAY)  · T3
   Adds the depth the v2.4.3 Payroll cell didn't have, without
   rewriting it: B1 run lifecycle (draft → close, immutable; close
   posts staff cost to the LEDGER), B2 compliance leveling L0–L3
   (gates the close), B3 earned-to-date, B4 earned-wage advances
   (cap 50% of ETD; registers the "Advance" approval type). Reads
   PAY.divisionSums as the cost lens — the LEDGER rollup keeps using
   that lens, so a closed run's posted cashbook row never double-counts.
   Node-safe; attaches to PAY via Object.assign.
   ============================================================ */
(function () {
  const PAY = window.PAY; if (!PAY) return;
  const kip = PAY.kip || ((n) => "₭ " + Number(Math.round(n) || 0).toLocaleString("en-US"));
  const audit = (act, ref) => { try { if (window.DB && DB.audit) DB.audit("Khamla S.", act, ref, "console"); } catch (e) {} };
  const pulse = () => { try { if (window.DATA && DATA.pulse) DATA.pulse(); } catch (e) {} };

  /* ---- B2 · compliance leveling L0–L3 (gates the close) ---- */
  const LEVELS = [["L0", "Setup — minimal checks"], ["L1", "Basic — NSSF/PIT enforced"], ["L2", "Standard — filings tracked"], ["L3", "Full — audit-ready"]];
  let LEVEL = 1; // default L1 so a run can close out of the box
  function leveling() { return { level: LEVEL, code: LEVELS[LEVEL][0], desc: LEVELS[LEVEL][1], all: LEVELS }; }
  function setLeveling(n) { LEVEL = Math.max(0, Math.min(3, Number(n) || 0)); audit("payroll.leveling_set", "L" + LEVEL); pulse(); return leveling(); }

  /* ---- B1 · run lifecycle: one current run, draft → close (immutable) ---- */
  let RUN = null;
  function run() {
    if (!RUN) {
      const sums = PAY.divisionSums();
      const sum = (k) => sums.reduce((a, s) => a + (s[k] || 0), 0);
      RUN = { id: "PR-2026-06", period: "2026-06", state: "draft", cost: sum("gross"), net: sum("net"), pit: sum("pit"), nssf: sum("nssf"), people: sums.reduce((a, s) => a + s.count, 0), closedAt: null };
    }
    return RUN;
  }
  function closeRun(who) {
    const r = run();
    if (r.state === "close") return { ok: false, err: "Run already closed — immutable. Post an adjustment instead." };
    if (LEVEL < 1) return { ok: false, err: "Raise compliance to L1 or higher before closing the run." };
    r.state = "close"; r.closedAt = "2026-06-25";
    try { if (window.LEDGER && LEDGER.postStaffCost) LEDGER.postStaffCost(r); } catch (e) {}
    // B4 recovery — net approved earned-wage advances against this run. This is a NET-PAY deduction,
    // not an employer-cost change, so it runs AFTER postStaffCost and never alters r.cost (no double-count).
    const rec = ADV.filter(a => a.status === "approved");
    rec.forEach(a => { a.status = "recovered"; a.recoveredRun = r.id; });
    r.recovered = rec.reduce((s, a) => s + (a.amount || 0), 0);
    r.recoveredCount = rec.length;
    audit("payroll.run_closed", r.id + " · " + kip(r.cost) + " → ledger" + (r.recoveredCount ? " · recovered " + kip(r.recovered) + " from " + r.recoveredCount + " advance(s)" : ""));
    pulse();
    return { ok: true, run: r };
  }

  /* ---- B3 · earned-to-date (pro-rata of net through the pay cycle) ---- */
  function earnedToDate(emp) {
    const c = PAY.components().find(x => x.emp === emp); if (!c) return { gross: 0, net: 0, pct: 0, full: 0 };
    let day = 15; try { if (window.CALCORE && CALCORE.iso) day = Number(CALCORE.iso(new Date()).slice(8, 10)); } catch (e) {}
    const frac = Math.min(1, Math.max(0, day) / 25);
    return { gross: Math.round(c.gross * frac), net: Math.round(c.net * frac), pct: Math.round(frac * 100), full: c.net };
  }

  /* ---- B4 · earned-wage advances (cap 50% of ETD) ---- */
  const ADV = [];
  const advances = () => ADV.slice();
  const advanceCap = (emp) => Math.round(earnedToDate(emp).net * 0.5);
  function requestAdvance(emp, amount) {
    const cap = advanceCap(emp);
    const amt = Math.min(Math.max(0, Math.round(amount || cap)), cap);
    const row = { id: "ADV-" + String(ADV.length + 1).padStart(3, "0"), emp, name: (PAY.components().find(x => x.emp === emp) || {}).name || emp, amount: amt, cap, status: "pending", date: "2026-06-15" };
    ADV.unshift(row);
    try { if (window.DATA && DATA.submitRequest) DATA.submitRequest("Advance", "EWA advance · " + kip(amt), { ewa: { emp, amount: amt, advId: row.id } }); } catch (e) {}
    audit("payroll.advance_requested", row.id + " · " + kip(amt) + " (cap " + kip(cap) + ")");
    pulse();
    return row;
  }
  // G5 — an approved "Advance" request flips its ADV row to "approved" (awaiting recovery at run close).
  // Called from DATA.approve via the same hook OT/Swap use. Matches by advId, falls back to oldest pending for the emp.
  function onRequestApproved(r) {
    if (!r || r.type !== "Advance") return null;
    const id = r.ewa && r.ewa.advId;
    let a = id ? ADV.find(x => x.id === id) : null;
    if (!a) a = ADV.find(x => x.status === "pending" && (!r.ewa || x.emp === r.ewa.emp));
    if (a && a.status === "pending") { a.status = "approved"; audit("payroll.advance_approved", a.id + " · " + kip(a.amount)); pulse(); }
    return a || null;
  }
  const recoverable = () => ADV.filter(a => a.status === "approved");          // approved, not yet recovered
  const recoveredTotal = () => ADV.filter(a => a.status === "recovered").reduce((s, a) => s + (a.amount || 0), 0);

  // register the "Advance" approvable type at load so the unified inbox knows it
  try { if (window.APPROVALS && APPROVALS.register) APPROVALS.register({ key: "Advance", label: "Earned-wage advance", scope: "hr", protective: false, check: "≤50% earned-to-date", cat: "others" }); } catch (e) {}

  Object.assign(window.PAY, { leveling, setLeveling, run, closeRun, earnedToDate, advances, advanceCap, requestAdvance, onRequestApproved, recoverable, recoveredTotal });
})();
