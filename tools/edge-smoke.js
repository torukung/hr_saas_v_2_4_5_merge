/* v2.4.1.edge.auth — edge-baseline smoke (B0–B6, client side)
   Walks: auth_mode flip · per-account mode switch BOTH ways · directory
   simulator login · fail-closed + break-glass · set-password flow ·
   file import (dry-run + commit) · directory delta-sync (queue + apply +
   conflict) · never-log · the new screens render · remote adapter mirrors
   a session · B7 parity (auth_mode=local seeds unchanged).
   Run: node tools/edge-smoke.js <build root> */
const fs = require("fs"), path = require("path");
const ROOT = process.argv[2] || path.join(__dirname, "..");
global.window = global;
const code = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
for (const f of ["js/i18n.js", "js/ui.js", "js/db.js", "js/api-config.js", "js/auth.js", "js/data.js", "js/provision.js", "js/devices.js",
  "js/screens/authviews.js", "js/screens/dbviews.js", "js/screens/reports.js",
  "js/screens/staff.js", "js/screens/manager.js", "js/screens/hr.js", "js/screens/ceo.js", "js/screens/sysadmin.js"]) eval(code(f));

const errors = [], ok = (c, m) => { if (!c) errors.push(m); };
DATA.state.tier = "professional"; // ceo/sysadmin personas + Pro features open

/* ---------- B0 · auth_mode ---------- */
ok(AUTH.authMode() === "local", "auth_mode should default to local");
AUTH.setAuthMode("remote", "smoke"); ok(AUTH.authMode() === "remote", "setAuthMode(remote) failed");
AUTH.setAuthMode("local", "smoke"); ok(AUTH.authMode() === "local", "setAuthMode(local) failed");

/* ---------- B7 · local parity — every seed account is local, login byte-identical ---------- */
ok(AUTH.accounts().every(a => (a.provider || "local") === "local"), "B7: all seed accounts must be local (parity)");
ok(AUTH.hash("staff@phoungern.la", "staff123") === "16dac5534531de3b382c63622327b8a2973782712ab0e7915e685b1541ea9ae8", "B7: hash vector drifted");
const base = AUTH.login("staff@phoungern.la", "staff123"); ok(base.ok, "B7: seed local login must work"); AUTH.logout();

/* ---------- seeds ---------- */
ok(DB.CATALOG.find(c => c.id === "db_identity").tables.length === 8, "db_identity should carry 8 tables");
ok(AUTH.providers().length === 2, "two directory providers seeded");
ok(AUTH.directory().length === 7, "seven directory simulator users seeded");

/* ---------- B2 · local → directory, both ways ---------- */
let r = AUTH.setMode("staff@phoungern.la", "ldap", { reason: "test" }, "smoke");
ok(r.ok && AUTH.account("staff@phoungern.la").provider === "ldap", "switch local→ldap failed");
ok(AUTH.account("staff@phoungern.la").hashPendingPurge === true, "stale hash must be flagged for purge");
ok(!!AUTH.dirUser("staff@phoungern.la"), "switching to a directory mode must seed a simulator entry");
ok(!AUTH.login("staff@phoungern.la", "staff123").ok, "old local password must be rejected after the switch");
const dirIn = AUTH.login("staff@phoungern.la", "directory123");
ok(dirIn.ok, "directory password must work via the simulator: " + (dirIn.msg || ""));
ok(AUTH.account("staff@phoungern.la").hash === null, "stale local hash must be purged on first directory verify");
AUTH.logout();

/* ---------- fail-closed + break-glass ---------- */
AUTH.providerSet("PROV-AD", { reachable: false }, "smoke");
const fc = AUTH.login("staff@phoungern.la", "directory123");
ok(!fc.ok && fc.code === "directory_down", "AD outage must fail closed (D2)");
ok(AUTH.login("sysadmin@phoungern.la", "sysadmin123").ok, "break-glass local admin must still sign in while AD is down");
AUTH.logout();
AUTH.providerSet("PROV-AD", { reachable: true }, "smoke");

/* ---------- directory → local: pending + set-password ---------- */
AUTH.setMode("staff@phoungern.la", "local", { reason: "AD dead" }, "smoke");
ok(AUTH.account("staff@phoungern.la").status === "pending", "ldap→local must leave the account pending");
const pend = AUTH.login("staff@phoungern.la", "whatever8");
ok(!pend.ok && pend.code === "pending", "pending account must be blocked until set-password");
const setMail = AUTH.mails().find(m => m.to === "staff@phoungern.la" && m.kind === "set_password");
ok(!!setMail && /ສະບາຍດີ/.test(setMail.bodyLo || "") && /Sabaidee/.test(setMail.body || ""), "set_password mail must be bilingual (EN + ລາວ) in the outbox");
const sp = AUTH.setPasswordViaToken(setMail.link.replace("#/setpw/", ""), "newlocal8", "newlocal8");
ok(sp.ok, "setPasswordViaToken failed: " + (sp.msg || ""));
ok(AUTH.login("staff@phoungern.la", "newlocal8").ok, "local login must work after set-password"); AUTH.logout();

/* ---------- break-glass cannot leave local ---------- */
ok(!AUTH.setMode("sysadmin@phoungern.la", "ldap", {}, "smoke").ok, "break-glass admin must refuse a directory switch");

/* ---------- B5 · file import ---------- */
const dr = PROV.dryRun(PROV.sampleCSV(), { mode: "local" });
ok(dr.items.length === 5, "dry-run should parse 5 rows, got " + dr.items.length);
ok(dr.items.some(x => x.action === "error"), "dry-run must flag the bad-email row");
ok(dr.items.some(x => x.action === "link"), "dry-run must flag an existing account as link");
const job = PROV.commitImport(PROV.sampleCSV(), { mode: "local", source: "edge-smoke.csv" }, "smoke");
ok(job.created >= 2 && AUTH.account("noy@phoungern.la"), "import must create new accounts");
ok(PROV.imports().some(j => j.id === job.id), "import job must be recorded");
ok(AUTH.mails().some(m => m.kind === "sync_notice"), "import must drop a notice mail");

/* ---------- B5 · directory delta-sync ---------- */
const run = PROV.runSync("PROV-AD", "smoke");
ok(run.queue.some(x => x.action === "create"), "sync must propose creates");
ok(run.conflicts >= 1, "sync must flag the imposter conflict");
const conflictItem = run.queue.find(x => x.action === "conflict");
ok(conflictItem && conflictItem.decision === "skip", "conflicts must be held (decision=skip), never auto-applied");
const ap = PROV.applySync(run.id, "smoke");
ok(ap.created >= 1 && AUTH.account("outhai@phoungern.la"), "applySync must create from the approved queue");
// suspend path: disable a directory member, re-sync → suspend proposal
AUTH.dirToggle("viengsavanh@phoungern.la", false, "smoke"); // already created above
const run2 = PROV.runSync("PROV-AD", "smoke");
ok(run2.queue.some(x => x.action === "suspend"), "disabling a directory member must propose a suspend");
// re-sync clears previous: only the freshest review stands
PROV.runSync("PROV-AD", "smoke");
ok(PROV.syncs().filter(r => r.state === "review").length === 1, "a new sync must supersede prior review runs (one review stands)");
ok(PROV.syncs()[0].state === "review", "the freshest run must be at the front");
ok(PROV.syncs().some(r => r.state === "superseded"), "a prior review must be marked superseded");

// individual lookup + bind one user (radius dir user wasn't touched by the AD sync above)
const found = PROV.search("khampheng");
ok(found.some(r => r.email === "khampheng@phoungern.la"), "search must find a directory user by name");
const target = found.find(r => r.email === "khampheng@phoungern.la");
ok(target.action === "create", "an unbound directory user must offer create");
const bound = PROV.bindDirectoryUser("khampheng@phoungern.la", "smoke");
ok(bound.ok && AUTH.account("khampheng@phoungern.la"), "bindDirectoryUser must create the account");
ok(AUTH.account("khampheng@phoungern.la").provider === "radius", "bound account must inherit the directory type (radius)");
ok(PROV.search("khampheng").find(r => r.email === "khampheng@phoungern.la").action === "bound", "after binding, the lookup must show bound");
ok(PROV.search("EMP-0188").length >= 1, "search must also match by employee ID");

/* ---------- never-log: simulator bind secret never on the ledger ---------- */
const ledger = JSON.stringify(DB.list("db_audit", "events"));
ok(!ledger.includes("directory123") && !ledger.includes("radius1234"), "never-log: a simulator bind secret leaked to the ledger");

/* ---------- the new screens render (no undefined/NaN) ---------- */
const screens = {
  providerPanel: AUTHV.providerPanel(),
  syncDashboard: AUTHV.syncDashboard("PROV-AD"),
  importWizard: AUTHV.importWizard(),
  setPasswordPage: AUTHV.setPasswordPage("TOK-NOPE"),
  identityBody: AUTHV.identityBody("all"),
  personAccess: AUTHV.personAccessCard(DATA.employees.find(e => e.id === "EMP-0214"))
};
for (const [name, html] of Object.entries(screens)) {
  ok(typeof html === "string" && html.length > 0 && !/undefined|NaN/.test(html), name + " rendered undefined/NaN");
}
ok(screens.providerPanel.includes("Directory simulator") && screens.providerPanel.includes("auth_mode"), "providerPanel missing provider/auth_mode UI");
// editable provider config — author the real server from the UI
ok(screens.providerPanel.includes('id="pv-PROV-AD-host"') && screens.providerPanel.includes('data-act="provider-save:PROV-AD"'), "providerPanel must render an editable form + Save");
ok(screens.providerPanel.includes('id="pv-PROV-AD-userDNTemplate"') && screens.providerPanel.includes("wrangler secret put RADIUS_SECRET"), "providerPanel must offer the DN template + the Worker secret snippet");
AUTH.providerSet("PROV-AD", { host: "dc1.acme.la:636", baseDN: "DC=acme,DC=la", userDNTemplate: "uid={user},ou=people,DC=acme,DC=la" }, "smoke");
ok(AUTH.provider("PROV-AD").host === "dc1.acme.la:636", "providerSet must update the host");
ok(AUTHV.providerPanel().includes("dc1.acme.la:636") && AUTHV.providerPanel().includes("uid={user}"), "edited config must re-render in the panel");
ok(AUTH.providerSet("PROV-AD", { secret: "leak-me" }, "smoke") && AUTH.provider("PROV-AD").secret === undefined, "providerSet must strip a literal secret");
ok(typeof AUTH.pushProviderToEdge === "function", "pushProviderToEdge must be exposed for the live edge push");
ok(screens.importWizard.includes("imp-csv") && screens.importWizard.includes("Dry-run"), "importWizard missing the input/dry-run control");
ok(screens.identityBody.includes("Built · Pro") && screens.identityBody.includes("sysadmin/web/providers"), "identity console missing the built LDAP row / providers link");
ok(screens.syncDashboard.includes('id="dirq"') && screens.syncDashboard.includes('data-act="prov-search"'), "syncDashboard must render the individual lookup search box");

/* ---------- B1 · remote adapter mirrors a session (mocked edge) ---------- */
(async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ ok: true, name: "Vilayvanh Chanthavong", emp: "EMP-0021", scopes: ["hr", "staff"], mode: "local" }) });
  window.API_CONFIG.base = "https://edge.test";
  AUTH.setAuthMode("remote", "smoke");
  ok(AUTH.remoteEnabled() === true, "remoteEnabled must be true when auth_mode=remote + a base URL is set");
  const rem = await AUTH.loginRemote("hr@phoungern.la", "whatever");
  ok(rem.ok && rem.edge === true, "loginRemote must mirror a session on edge success");
  ok(!!AUTH.session() && AUTH.session().email === "hr@phoungern.la", "edge sign-in must create a local session mirror");
  AUTH.logout(); AUTH.setAuthMode("local", "smoke"); window.API_CONFIG.base = "";

  console.log("edge-smoke: " + (errors.length ? "FAIL\n  " + errors.join("\n  ") : "ALL CHECKS PASS — auth_mode · mode-switch both ways · simulator login · fail-closed+break-glass · set-password · import · delta-sync(+conflict/suspend) · never-log · screens · remote adapter · B7 parity"));
  process.exit(errors.length ? 1 : 0);
})();
