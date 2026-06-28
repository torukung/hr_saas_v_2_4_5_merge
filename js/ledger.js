/* ============================================================
   ADEPTIO · v2.4.5 — the LEDGER cell  (window.LEDGER)  · T2 (A1)
   The cashbook's one writer (db_ledger). Posts cash movements
   (revenue · expense · staff cost), rolls them up for the HR
   Accounting screens and the CEO board, and exposes a derived
   6-month DW series (A3). Staff cost posts here automatically
   when a payroll run closes — T3 calls LEDGER.postStaffCost(run).
   Reads payroll as a lens for live staff cost. Node-safe.
   ============================================================ */
window.LEDGER = (function () {
  const list = (t) => { try { return DB.list("db_ledger", t) || []; } catch (e) { return []; } };
  const cashbook = () => list("cashbook");
  const recurring = () => list("recurring");
  const pulse = () => { try { if (window.DATA && DATA.pulse) DATA.pulse(); } catch (e) {} };

  // live staff cost — prefer the payroll lens, else any posted staff-cost rows
  function staffCost() {
    try { if (window.PAY && PAY.divisionSums) return PAY.divisionSums().reduce((a, s) => a + (s.gross || 0), 0); } catch (e) {}
    return cashbook().filter(r => r.kind === "staff").reduce((a, r) => a + (r.amount || 0), 0);
  }
  function rollup() {
    const cb = cashbook();
    const revenue = cb.filter(r => r.kind === "revenue").reduce((a, r) => a + (r.amount || 0), 0);
    const expense = cb.filter(r => r.kind === "expense").reduce((a, r) => a + (r.amount || 0), 0);
    const staff = staffCost();
    const result = revenue - expense - staff;
    return { revenue, expense, staff, result, margin: revenue ? result / revenue : 0, staffRatio: revenue ? staff / revenue : 0 };
  }
  function topExpenses(n) {
    const by = {}; cashbook().filter(r => r.kind === "expense").forEach(r => { by[r.cat] = (by[r.cat] || 0) + (r.amount || 0); });
    return Object.entries(by).map(([cat, amount]) => ({ cat, amount })).sort((a, b) => b.amount - a.amount).slice(0, n || 5);
  }
  function post(entry, who) {
    const arr = list("cashbook");
    const row = Object.assign({ id: "CB-" + String(arr.length + 1).padStart(4, "0"), date: "2026-06-15" }, entry);
    try { DB.add("db_ledger", "cashbook", row, who || "Thip N."); } catch (e) {}
    try { if (window.DB && DB.audit) DB.audit(who || "Thip N.", "ledger.post", row.id + " · " + row.kind + " · " + (row.amount || 0), "console"); } catch (e) {}
    pulse(); return row;
  }
  // called by T3 when a payroll run closes — posts the locked staff cost
  function postStaffCost(run) {
    const amt = (run && (run.cost || run.totals && run.totals.cost)) || staffCost();
    return post({ kind: "staff", cat: "Payroll", note: "Staff cost — payroll close" + (run && run.id ? " " + run.id : ""), amount: amt }, "system");
  }
  // derived 6-month revenue vs staff-cost series (A3 DW) for the cost-benefit chart
  function series() {
    const base = rollup(); const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    return months.map((m, i) => ({ month: m, revenue: Math.round(base.revenue * (0.78 + i * 0.05)), staffCost: Math.round((base.staff || base.expense) * (0.84 + i * 0.04)) }));
  }
  return { cashbook, recurring, staffCost, rollup, topExpenses, post, postStaffCost, series };
})();
