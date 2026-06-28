/* v2.4.0.db.auth — auth smoke (Blueprint v2.5 §3 "Done =")
   Walks: invite → activate → login per persona → reset → lockout →
   unlock → offboard-revokes-session — both tiers, flag on and off.
   Run: node tools/auth-smoke.js <build root> */
const fs = require("fs"), path = require("path");
const ROOT = process.argv[2] || path.join(__dirname, "..");
global.window = global;
const code = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
eval(code("js/i18n.js"));
eval(code("js/ui.js"));
eval(code("js/db.js"));
eval(code("js/api-config.js"));
eval(code("js/auth.js"));
eval(code("js/data.js"));
eval(code("js/provision.js"));
eval(code("js/devices.js"));   // v2.4.2 devices cell
eval(code("js/screens/authviews.js"));
eval(code("js/screens/dbviews.js"));
eval(code("js/screens/reports.js"));
for (const f of ["staff", "manager", "hr", "ceo", "sysadmin"]) eval(code("js/screens/" + f + ".js")); // PERSONAS — the login frames read them

const errors = [], ok = (cond, msg) => { if (!cond) errors.push(msg); };

/* ---------- store 11 wiring ---------- */
ok(DB.CATALOG.length === 14, "catalog: expected 14 stores (v2.4.4 adds db_schedule), got " + DB.CATALOG.length);
ok(DB.CATALOG.some(c => c.id === "db_identity" && c.sensitive), "catalog: db_identity missing or not sensitive");
ok(DB.list("db_platform", "registry").some(r => r.store === "db_identity" && r.encryption === "per-tenant-key"), "registry: db_identity not per-tenant-key");
ok((DB.policy("db_identity") || {}).note.includes("excluded"), "policy: db_identity custody note missing");
ok(AUTH.portalOn() === true, "flag: auth_portal should seed ON");
ok(AUTH.roadmap().length >= 6, "flags: roadmap rows missing");
const ldap = AUTH.flag("auth.ldap"), sso = AUTH.flag("auth.sso"), scim = AUTH.flag("auth.scim");
ok(ldap && ldap.tier === "professional", "D1: LDAP/RADIUS must badge Professional");
ok(sso && sso.tier === "enterprise" && scim && scim.tier === "enterprise", "D1: SSO/SCIM must badge Enterprise");
ok(AUTH.policy().minLen === 8, "D3: min length must be 8");

/* ---------- D4 — 2 demo accounts per persona, printable, all login ---------- */
DATA.state.tier = "professional"; // ceo/sysadmin personas open
const seedAccounts = AUTH.SEEDPW.flatMap(g => g.accounts);
ok(seedAccounts.length === 10, "D4: expected 10 printed accounts (2 × 5 personas)");
for (const g of AUTH.SEEDPW) {
  ok(g.accounts.length === 2, "D4: " + g.persona + " needs exactly 2 demo accounts");
  for (const [em, pw] of g.accounts) {
    const res = AUTH.login(em, pw);
    ok(res.ok, "login failed for " + em + (res.msg ? " — " + res.msg : ""));
    if (res.ok) {
      ok(AUTH.primaryScope(res.acc.scopes) === g.persona, "landing: " + em + " should land on " + g.persona);
      ok(!!AUTH.session(), "session missing after login " + em);
      if (g.persona === "manager" || g.persona === "hr") ok(res.acc.scopes.includes("staff"), em + " must also carry the staff scope");
      if (res.acc.scopes.includes("staff") && DATA.employees.find(e => e.id === res.acc.emp))
        ok(DATA.me.staff.id === res.acc.emp, "staff lens did not follow " + em);
      AUTH.logout();
      ok(!AUTH.session(), "logout left a session for " + em);
    }
  }
}
ok(AUTH.stats().loginsToday >= 10, "ledger: login facts missing (got " + AUTH.stats().loginsToday + ")");

/* ---------- tier rule — ceo/sysadmin accounts blocked on Essential ---------- */
DATA.state.tier = "essential";
const tierRes = AUTH.login("sysadmin@phoungern.la", "sysadmin123");
ok(!tierRes.ok && tierRes.code === "tier", "essential: sysadmin@ should hit the tier gate (HR doubles)");
const ceoRes = AUTH.login("ceo@phoungern.la", "ceo123456");
ok(!ceoRes.ok && ceoRes.code === "tier", "essential: ceo@ should hit the tier gate");
const hrRes = AUTH.login("hr@phoungern.la", "hr123456");
ok(hrRes.ok, "essential: hr@ must sign in (doubles as admin)");
AUTH.logout();
DATA.state.tier = "professional";

/* ---------- invite → outbox → activate → login (§3 steps 4–6) ---------- */
const mailsBefore = AUTH.mails().length;
const empId = DATA.hireStaff({ name: "Khamphone Soudavanh", pos: "Machine Operator", div: "Production", team: "Line A" });
const bad = AUTH.invite({ emp: empId, name: "Khamphone Soudavanh", email: "not-an-email", scope: "staff", who: "smoke" });
ok(!bad.ok, "invite: must reject an invalid e-mail (required at switch-on)");
const inv = AUTH.invite({ emp: empId, name: "Khamphone Soudavanh", email: "khamphone@phoungern.la", scope: "staff", who: "smoke" });
ok(inv.ok, "invite failed: " + (inv.msg || ""));
ok(AUTH.account("khamphone@phoungern.la").status === "invited", "invite: account not in invited state");
const invMail = AUTH.mails().find(m => m.to === "khamphone@phoungern.la" && m.kind === "invite");
ok(!!invMail && AUTH.mails().length === mailsBefore + 1, "outbox: invite mail missing");
ok(!!invMail && /ສະບາຍດີ/.test(invMail.bodyLo || ""), "outbox: invite must be bilingual (ລາວ body)");
const tok = invMail ? invMail.link.replace("#/activate/", "") : "";
const pre = AUTH.login("khamphone@phoungern.la", "whatever8");
ok(!pre.ok && pre.code === "invited", "portal: invited account must be told to activate first");
ok(!AUTH.activate(tok, "short", "short").ok, "policy: 5-char password must fail (min 8)");
ok(!AUTH.activate(tok, "longenough", "different").ok, "policy: mismatched confirm must fail");
const act = AUTH.activate(tok, "khamphone1", "khamphone1");
ok(act.ok, "activate failed: " + (act.msg || ""));
ok(!AUTH.token(tok).ok, "token: activation link must be single-use");
ok(AUTH.mails().some(m => m.to === "khamphone@phoungern.la" && m.kind === "activated"), "outbox: activation confirmation missing");
const kLogin = AUTH.login("khamphone@phoungern.la", "khamphone1");
ok(kLogin.ok, "login after activation failed");
AUTH.logout();

/* ---------- reset — request → mail → new password (old one dies) ---------- */
const rr = AUTH.resetRequest("khamphone@phoungern.la");
ok(rr.ok, "reset request failed");
ok(AUTH.resetRequest("ghost@phoungern.la").ok, "reset: must not reveal unknown addresses");
const rMail = AUTH.mails().find(m => m.to === "khamphone@phoungern.la" && m.kind === "reset_request");
ok(!!rMail, "outbox: reset mail missing");
const rTok = rMail ? rMail.link.replace("#/reset/", "") : "";
const rd = AUTH.resetDo(rTok, "khamphone2", "khamphone2");
ok(rd.ok, "resetDo failed: " + (rd.msg || ""));
ok(!AUTH.login("khamphone@phoungern.la", "khamphone1").ok, "reset: old password must die");
ok(AUTH.login("khamphone@phoungern.la", "khamphone2").ok, "reset: new password must work");
AUTH.logout();

/* ---------- lockout — 5 fails → 15 min · correct password still blocked · unlock ---------- */
for (let i = 0; i < 5; i++) AUTH.login("khamphone@phoungern.la", "wrong-pw-" + i);
const accK = AUTH.account("khamphone@phoungern.la");
ok(AUTH.lockRemainMs(accK) > 13 * 60e3 && AUTH.lockRemainMs(accK) <= 15 * 60e3, "lockout: ~15 min window expected");
ok(AUTH.mails().some(m => m.to === "khamphone@phoungern.la" && m.kind === "lockout"), "outbox: lockout mail missing");
const lockedTry = AUTH.login("khamphone@phoungern.la", "khamphone2");
ok(!lockedTry.ok && lockedTry.code === "locked", "lockout: correct password must still be blocked while locked");
ok(AUTH.unlock("khamphone@phoungern.la", "smoke"), "unlock failed");
ok(AUTH.login("khamphone@phoungern.la", "khamphone2").ok, "post-unlock login failed");

/* ---------- sessions — revoke others · custody (never restored) ---------- */
const s1 = AUTH.session();
const extra = AUTH.login("khamphone@phoungern.la", "khamphone2"); // second session, same account
ok(AUTH.mySessions().length >= 2, "sessions: expected 2 live sessions");
ok(AUTH.revokeOthers() >= 1, "sessions: revokeOthers failed");
ok(AUTH.mySessions().length === 1, "sessions: revokeOthers left strays");
const bk = DB.backups.now(["db_identity"], "manual", "auth-smoke");
const sesNow = AUTH.session().id;
AUTH.logout();
ok(!AUTH.session(), "logout failed before custody check");
DB.backups.restore(bk.id, ["db_identity"]);
ok(!DB.list("db_identity", "sessions").some(s => s.id === sesNow), "custody: restore resurrected a session (must never happen)");
ok(DB.list("db_identity", "accounts").some(a => a.email === "khamphone@phoungern.la"), "custody: accounts must restore");

/* ---------- offboard revokes access + sessions (exit checklist) ---------- */
const back = AUTH.login("khamphone@phoungern.la", "khamphone2");
ok(back.ok, "re-login for offboard test failed");
DATA.offboardStaff(empId);
ok(AUTH.account("khamphone@phoungern.la").status === "disabled", "offboard: account must be disabled");
ok(!AUTH.session(), "offboard: live session must be revoked");
ok(AUTH.mails().some(m => m.to === "khamphone@phoungern.la" && m.kind === "revoked"), "outbox: revoked mail missing");
const offTry = AUTH.login("khamphone@phoungern.la", "khamphone2");
ok(!offTry.ok && offTry.code === "disabled", "offboard: disabled account must not sign in");

/* ---------- portal flag — off = persona menu, on = the wall ---------- */
AUTH.setPortal(false, "smoke");
ok(!AUTH.portalOn(), "flag: setPortal(false) failed");
AUTH.setPortal(true, "smoke");
ok(AUTH.portalOn(), "flag: setPortal(true) failed");

/* ---------- never-log list — no seed password or hash-input leaks on the ledger ---------- */
const ledger = JSON.stringify(DB.list("db_audit", "events"));
for (const [, pw] of seedAccounts) ok(!ledger.includes(pw), "never-log: ledger leaked a password: " + pw);
ok(!ledger.includes("khamphone1") && !ledger.includes("khamphone2"), "never-log: ledger leaked a user password");
ok(!/TOK-[0-9A-Z]/.test(ledger), "never-log: ledger leaked a token id");
const acctDump = JSON.stringify(DB.list("db_identity", "accounts"));
for (const [, pw] of seedAccounts) ok(!acctDump.includes('"' + pw + '"'), "never-log: db_identity stored a plain password");

/* ---------- portal pages build (string render, both langs) ---------- */
for (const lang of ["en", "lo"]) {
  AUTHV.state.lang = lang;
  AUTHV.state.mode = "login";
  const pg = AUTHV.loginPage();
  ok(pg.includes("lp-frame") && pg.includes("login-card") && !/undefined|NaN/.test(pg), "loginPage broken (" + lang + ")");
  ok(pg.includes("staff@phoungern.la") && pg.includes("sysadmin2@phoungern.la"), "loginPage missing persona-frame accounts (" + lang + ")");
  ok(pg.includes('data-act="auth-login-p:staff"') && pg.includes('data-act="auth-login-p:sysadmin"'), "loginPage missing per-frame sign-in buttons (" + lang + ")");
  ok(pg.includes('value="staff123"') && pg.includes('value="hr123456"'), "loginPage missing pre-filled demo passwords (" + lang + ")");
  ok(pg.includes('data-go="launcher"'), "loginPage missing return-to-persona-page link (" + lang + ")");
  ok(!pg.includes("ink-bar") && !pg.includes('id="ink"'), "loginPage still carries the removed background effect (" + lang + ")");
}
const actPage = AUTHV.activatePage("TOK-SEED-DAVONE");
ok(actPage.includes("davone@phoungern.la") && !/undefined/.test(actPage), "activatePage broken for seeded token");
ok(AUTHV.resetPage("TOK-NOPE").includes("Unknown reset link"), "resetPage must handle unknown tokens");
ok(AUTHV.identityBody("all").includes("sysadmin@phoungern.la"), "identity console missing accounts");
ok(AUTHV.accessBody().includes("Invite funnel"), "access screen missing funnel");
ok(AUTHV.outboxBody("hr/web", "MAIL-0200").includes("TOK-SEED-DAVONE"), "outbox viewer missing seeded mail link");

/* ---------- hash sanity — known vector ---------- */
ok(AUTH.hash("staff@phoungern.la", "staff123") === "16dac5534531de3b382c63622327b8a2973782712ab0e7915e685b1541ea9ae8", "sha256: hash mismatch vs seed (UTF-8 path broken?)");

console.log("auth-smoke: " + (errors.length ? "FAIL\n  " + errors.join("\n  ") : "ALL CHECKS PASS — invite → activate → login ×10 → reset → lockout → unlock → custody → offboard → flag, both tiers"));
if (errors.length) process.exit(1);
