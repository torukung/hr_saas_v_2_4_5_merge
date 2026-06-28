/* ============================================================
   ADEPTIO · i18n scaffold
   EN ships now. ລາວ (lo) is staged: keys exist, strings arrive
   in the build phase. Pattern: every UI label goes through t().
   Fallback chain: lo → en → key.
   Lao font (Noto Sans Lao) is already in the font stack.
   ============================================================ */
window.I18N = (function () {
  const en = {
    // global
    "app.name": "Adeptio", "app.suite": "Adaptive HR",
    "nav.web": "Web", "nav.mobile": "Mobile",
    "personas.staff": "Staff", "personas.manager": "Manager", "personas.hr": "HR",
    "personas.ceo": "CEO", "personas.sysadmin": "System Admin",
    "common.viewAll": "View all", "common.open": "Open", "common.back": "Back",
    "common.approve": "Approve", "common.return": "Return", "common.submit": "Submit",
    "common.cancel": "Cancel", "common.export": "Export", "common.download": "Download",
    "common.today": "Today", "common.readonly": "Read-only", "common.search": "Search",
    "common.quickActions": "Quick actions", "common.status": "Status",
    "common.pending": "Pending", "common.approved": "Approved", "common.returned": "Returned",
    "common.draft": "Draft", "common.all": "All",
    // staff nav
    "staff.home": "My day", "staff.time": "Time", "staff.requests": "Requests",
    "staff.payslips": "Payslips", "staff.documents": "Documents", "staff.me": "Me",
    // manager nav
    "mgr.overview": "Overview", "mgr.approvals": "Approvals", "mgr.team": "Team",
    "mgr.schedule": "Schedule", "mgr.reports": "Reports", "mgr.alerts": "Alerts",
    // hr nav
    "hr.pulse": "HR pulse", "hr.people": "People & Org", "hr.time": "Time & Attendance",
    "hr.leave": "Leave", "hr.payroll": "Payroll", "hr.approvals": "Approvals",
    "hr.comms": "Communication", "hr.reports": "Reports", "hr.docs": "Documents",
    "hr.queue": "Queue",
    // ceo nav
    "ceo.board": "Board", "ceo.trends": "Trends", "ceo.divisions": "Divisions",
    "ceo.compliance": "Compliance", "ceo.packs": "Board packs",
    // sysadmin nav
    "sys.health": "Platform health", "sys.templates": "Templates", "sys.channels": "Channels",
    "sys.roles": "Roles & permissions", "sys.integrations": "Integrations", "sys.audit": "Audit log"
  };

  // Lao pack — staged. Keys mirror `en`; strings land in the build phase.
  // (A handful are pre-seeded as proof of the pipeline.)
  const lo = {
    "staff.home": "ມື້ຂອງຂ້ອຍ",
    "staff.time": "ເວລາ",
    "staff.requests": "ຄຳຮ້ອງ",
    "common.approve": "ອະນຸມັດ",
    "common.today": "ມື້ນີ້"
  };

  let lang = "en";
  const packs = { en, lo };

  return {
    t(key) {
      const p = packs[lang] || en;
      return p[key] !== undefined ? p[key] : (en[key] !== undefined ? en[key] : key);
    },
    setLang(l) { lang = l; },
    getLang() { return lang; },
    ready(l) { return l === "en"; } // lo flips true when the pack ships
  };
})();
window.t = (k) => window.I18N.t(k);
