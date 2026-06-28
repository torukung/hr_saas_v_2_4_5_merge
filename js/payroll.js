/* ============================================================
   ADEPTIO · v2.4.3 — the Payroll cell  (db_payroll +components +tax_config)
   Owns the per-employee pay components (allowance / OT / misc, by
   division), the NSSF + PIT tax config (with a statutory compliance
   baseline), per-division sums, payslip month sums, the remittance
   deadline, and CSV/JSON export-import. Reads stay derived; the
   store holds the editable inputs. Node-safe for tools/smoke.js.
   ============================================================ */
window.PAY = (function () {
  const pulse = () => { try { if (window.DATA && DATA.pulse) DATA.pulse(); } catch (e) {} };
  const audit = (who, act, obj, ip) => { try { if (window.DB && DB.audit) DB.audit(who, act, obj, ip || "console"); } catch (e) {} };
  const list = (t) => { try { return DB.list("db_payroll", t) || []; } catch (e) { return []; } };
  const persist = () => { try { DB.persist("db_payroll"); } catch (e) {} };
  const kip = (n) => "₭ " + Number(Math.round(n) || 0).toLocaleString("en-US");

  /* statutory baseline — the editable config is compared against this */
  const STATUTORY = {
    nssfEmp: 5.5, nssfEr: 6.0, nssfCap: 4500000, pitExempt: 1300000,
    brackets: [[1300000, 0], [5000000, 5], [15000000, 10], [25000000, 15], [65000000, 20], [null, 25]]
  };

  /* ---------- tax config ---------- */
  function taxConfig() {
    return list("tax_config")[0] || { id: "TAX-LA", ...STATUTORY, otWeekday: 150, otRestday: 200, otHoliday: 300, otNight: 150, note: "" };
  }
  function setTaxConfig(patch, who) {
    const arr = list("tax_config");
    let t = arr[0];
    if (!t) { t = { id: "TAX-LA", ...STATUTORY }; arr.unshift(t); }
    Object.assign(t, patch); t.updated = "Jun 2026";
    persist();
    audit(who || "Vilayvanh C.", "payroll.tax_config_changed", Object.keys(patch).join(", "), "10.0.4.12");
    pulse();
    return t;
  }
  function resetTaxConfig(who) {
    return setTaxConfig({ ...STATUTORY }, who);
  }
  function computeNSSF(gross) {
    const t = taxConfig();
    return Math.round(Math.min(gross, t.nssfCap) * (t.nssfEmp / 100));
  }
  function computePIT(base, brackets) {
    brackets = brackets || taxConfig().brackets;
    let tax = 0, lo = 0;
    for (const [upTo, rate] of brackets) {
      const hi = (upTo == null) ? Infinity : upTo;
      if (base > lo) tax += (Math.min(base, hi) - lo) * (rate / 100);
      lo = hi;
      if (base <= hi) break;
    }
    return Math.round(Math.max(0, tax));
  }
  function compliance() {
    const t = taxConfig(); const diffs = [];
    if (t.nssfEmp !== STATUTORY.nssfEmp) diffs.push(`NSSF employee ${t.nssfEmp}% vs statutory ${STATUTORY.nssfEmp}%`);
    if (t.nssfEr !== STATUTORY.nssfEr) diffs.push(`NSSF employer ${t.nssfEr}% vs statutory ${STATUTORY.nssfEr}%`);
    if (Number(t.nssfCap) !== STATUTORY.nssfCap) diffs.push(`NSSF cap ${kip(t.nssfCap)} vs ${kip(STATUTORY.nssfCap)}`);
    if (Number(t.pitExempt) !== STATUTORY.pitExempt) diffs.push(`PIT exemption ${kip(t.pitExempt)} vs ${kip(STATUTORY.pitExempt)}`);
    if (JSON.stringify(t.brackets) !== JSON.stringify(STATUTORY.brackets)) diffs.push("PIT brackets differ from statutory");
    return { level: diffs.length ? "Adjusted" : "Compliant", diffs, baseline: STATUTORY };
  }

  /* ---------- per-employee components (basis for the by-division list) ---------- */
  function basicFor(e) {
    const p = (e.pos || "").toLowerCase();
    if (/manager|lead/.test(p)) return 9000000;
    if (/supervisor/.test(p)) return 6500000;
    if (/officer|accountant|executive|coordinator/.test(p)) return 4800000;
    if (/technician|inspector|safety/.test(p)) return 4200000;
    return 3600000; // operator · packer · driver · receptionist · support
  }
  function allowanceFor(e) {
    const p = (e.pos || "").toLowerCase();
    const role = /manager|supervisor|lead/.test(p) ? 600000 : /officer|accountant|executive/.test(p) ? 300000 : 0;
    return 900000 + role; // meal + transport (₭900k) + role allowance
  }
  function buildRow(e) {
    const basic = basicFor(e);
    const hourly = basic / 176;
    const ot = Math.round((e.ot || 0) * hourly * 1.5);
    return {
      id: "PCMP-" + String(e.id).replace(/\D/g, ""), emp: e.id, name: e.name, div: e.div,
      basic, allowance: allowanceFor(e), ot, misc: (e.attend || 0) >= 98 ? 200000 : 0, otHours: e.ot || 0
    };
  }
  function ensure() {
    let arr; try { arr = DB.list("db_payroll", "components"); } catch (e) { return []; }
    if (arr && arr.length) return arr;
    let emp; try { emp = DB.list("db_people", "employees"); } catch (e) { emp = []; }
    try {
      const store = DB.raw && DB.raw("db_payroll");
      if (store) { store.components = emp.map(buildRow); persist(); }
    } catch (e) {}
    audit("system", "payroll.components_seeded", emp.length + " rows derived from db_people", "payroll");
    return list("components");
  }
  function withDerived(c) {
    const gross = (c.basic || 0) + (c.allowance || 0) + (c.ot || 0) + (c.misc || 0);
    const nssf = computeNSSF(gross);
    const pit = computePIT(gross - nssf);
    return { ...c, gross, nssf, pit, net: gross - nssf - pit };
  }
  const components = () => ensure().map(withDerived);
  function setComponent(emp, patch, who) {
    const c = ensure().find(x => x.emp === emp); if (!c) return null;
    ["basic", "allowance", "ot", "misc"].forEach(k => { if (patch[k] != null) c[k] = Math.max(0, Math.round(Number(patch[k]) || 0)); });
    persist();
    audit(who || "Latsamy V.", "payroll.component_edited", emp + " · " + Object.keys(patch).join(", "), "10.0.4.12");
    pulse();
    return c;
  }
  function byDivision() {
    const map = {};
    components().forEach(r => { (map[r.div] = map[r.div] || []).push(r); });
    return map;
  }
  function divisionSums() {
    const map = byDivision(); const out = [];
    Object.keys(map).forEach(div => {
      const rs = map[div];
      const s = rs.reduce((a, r) => { a.basic += r.basic; a.allowance += r.allowance; a.ot += r.ot; a.misc += r.misc; a.gross += r.gross; a.nssf += r.nssf; a.pit += r.pit; a.net += r.net; return a; },
        { basic: 0, allowance: 0, ot: 0, misc: 0, gross: 0, nssf: 0, pit: 0, net: 0 });
      out.push({ div, count: rs.length, ...s });
    });
    return out;
  }

  /* ---------- payslip month sums ---------- */
  const months = () => [...new Set(list("payslips").map(p => p.period))];
  function monthSum(period) {
    return list("payslips").filter(p => !period || p.period === period)
      .reduce((a, p) => { a.gross += Number(p.gross) || 0; a.net += Number(p.net) || 0; a.count++; return a; }, { gross: 0, net: 0, count: 0 });
  }

  /* ---------- remittance deadline — 15th of the following month (Lao rule) ---------- */
  function deadline() {
    const now = new Date();
    let y = now.getFullYear(), m = now.getMonth();
    if (now.getDate() > 15) { m += 1; if (m > 11) { m = 0; y += 1; } }
    const due = new Date(y, m, 15);
    const days = Math.max(0, Math.ceil((due - now) / 86400000));
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return { date: MON[m] + " 15, " + y, days, label: "NSSF + PIT remittance" };
  }

  /* ---------- export / import by division (matrices; app.js does file I/O) ---------- */
  const COLS = ["emp", "name", "div", "basic", "allowance", "ot", "misc"];
  function exportMatrix(div) {
    const rows = ensure().filter(c => !div || div === "all" || c.div === div);
    return [COLS].concat(rows.map(c => COLS.map(k => c[k])));
  }
  function importCSV(text, div, who) {
    const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return { ok: false, msg: "Nothing to import", n: 0 };
    const head = lines[0].split(",").map(s => s.trim().replace(/^"|"$/g, ""));
    const idx = (k) => head.indexOf(k);
    let n = 0;
    for (let i = 1; i < lines.length; i++) {
      const cells = (lines[i].match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []).map(s => s.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'));
      const emp = cells[idx("emp")]; if (!emp) continue;
      if (div && div !== "all") { const c0 = ensure().find(x => x.emp === emp); if (c0 && c0.div !== div) continue; }
      const patch = {};
      ["basic", "allowance", "ot", "misc"].forEach(k => { const j = idx(k); if (j >= 0 && cells[j] !== undefined && cells[j] !== "") patch[k] = Number(cells[j]) || 0; });
      if (setComponent(emp, patch, who)) n++;
    }
    audit(who || "Latsamy V.", "payroll.components_imported", (div || "all") + " · " + n + " row(s)", "10.0.4.12");
    return { ok: true, n };
  }

  return {
    STATUTORY, kip, COLS,
    taxConfig, setTaxConfig, resetTaxConfig, computeNSSF, computePIT, compliance,
    components, ensure, setComponent, byDivision, divisionSums,
    months, monthSum, deadline, exportMatrix, importCSV
  };
})();
