/* ============================================================
   ADEPTIO · v2.4.5 — the PROFILE cell  (window.PROFILE)  · T4 (E1)
   Schema-driven employee profile (General · Personal · Job), read
   from db_people. Sealed fields (DOB · National ID) are masked.
   The same builder serves the HR editor and the Staff "Me" view.
   Node-safe; never writes — HR edits go through the People cell.
   ============================================================ */
window.PROFILE = (function () {
  const SECTIONS = [
    { id: "general",  label: "General",  icon: "user",     fields: [["name", "Full name"], ["id", "Employee ID"], ["pos", "Position"], ["div", "Division"], ["team", "Team"], ["state", "Status"]] },
    { id: "personal", label: "Personal", icon: "shield", sealed: true, fields: [["dob", "Date of birth"], ["nid", "National ID"], ["phone", "Phone"], ["pemail", "Personal email"]] },
    { id: "job",      label: "Job",      icon: "briefcase", fields: [["pos", "Title"], ["div", "Division"], ["start", "Start date"], ["manager", "Reports to"]] }
  ];
  const emp = (id) => { try { return (DB.list("db_people", "employees") || []).find(e => e.id === id) || null; } catch (e) { return null; } };
  const mask = (v) => v ? String(v).replace(/.(?=.{2})/g, "•") : "—";
  const FALLBACK = { start: "2024-03-01", manager: "Khamla S.", dob: "1990-05-12", nid: "1-2345-67890-12", phone: "+856 20 5xxx xxxx" };
  function value(e, key, sealed) {
    let v = e ? e[key] : null;
    if (v == null && key === "pemail") v = (e && e.id ? e.id.toLowerCase() : "staff") + "@mail.la";
    if (v == null && FALLBACK[key] != null) v = FALLBACK[key];
    return sealed ? mask(v) : (v || "—");
  }
  const sections = () => SECTIONS;
  return { sections, emp, value, mask };
})();
