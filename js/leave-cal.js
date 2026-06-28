/* ============================================================
   ADEPTIO · v2.4.5 — Leave & calendar UX  (window.LEAVECAL)  · T5 (F1)
   Lao public + company holidays, the leave time-off types and a
   simple balance set for the Staff two-pane and the Manager/HR team
   calendar. The roster/calendar-core stays the render engine; this
   cell just adds holidays + time-off catalogue. Node-safe.
   ============================================================ */
window.LEAVECAL = (function () {
  const SEED = [
    { date: "2026-06-01", name: "Children's Day",          kind: "public" },
    { date: "2026-06-15", name: "Company Foundation Day",  kind: "company" },
    { date: "2026-07-19", name: "Free Lao Day",            kind: "public" },
    { date: "2026-10-12", name: "Boat Racing Festival",    kind: "public" }
  ];
  let HOL = SEED.slice();
  const TYPES = [["annual", "Annual leave"], ["sick", "Sick leave"], ["personal", "Personal"], ["unpaid", "Unpaid"], ["maternity", "Maternity"], ["bereavement", "Bereavement"]];
  const BAL = [["Annual", 12, 4], ["Sick", 30, 2], ["Personal", 5, 1]]; // [type, entitled, used]

  const holidays = () => HOL.slice().sort((a, b) => a.date < b.date ? -1 : 1);
  const isHoliday = (iso) => HOL.find(h => h.date === iso) || null;
  function addHoliday(date, name, kind, who) {
    if (!date || !name) return null;
    const row = { date, name, kind: kind || "company" }; HOL.push(row);
    try { if (window.DB && DB.audit) DB.audit(who || "Vilayvanh C.", "leave.holiday_added", date + " · " + name, "console"); } catch (e) {}
    try { if (window.DATA && DATA.pulse) DATA.pulse(); } catch (e) {}
    return row;
  }
  const types = () => TYPES;
  const balances = () => BAL;
  return { holidays, isHoliday, addHoliday, types, balances };
})();
