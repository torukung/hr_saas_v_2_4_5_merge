/* v2.4.0.db.auth — portal smoke: boots the WHOLE app (app.js included)
   inside a minimal DOM and walks the fine-tuned flow: persona page
   lands first → entering a persona raises the wall → persona-frame
   login (pre-filled demo credentials) → scope bounce → My security →
   outbox → console → activation handoff → logout returns to login →
   flag off restores the plain persona menu.
   Run: node tools/portal-smoke.js <build root> */
const fs = require("fs"), path = require("path");
const ROOT = process.argv[2] || path.join(__dirname, "..");
const code = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const errors = [], ok = (c, m) => { if (!c) errors.push(m); };

/* ---------- mini-DOM ---------- */
let APP_HTML = "", elCache = {};
const L = { win: {}, doc: {} };
const on = (bag) => (t, fn) => { (bag[t] = bag[t] || []).push(fn); };
const fire = (bag, t, ev) => (bag[t] || []).slice().forEach(fn => { try { fn(ev || {}); } catch (e) { errors.push("listener " + t + " threw: " + e.message); } });

function genericEl() {
  const kids = [];
  return {
    dataset: {}, style: { cssText: "" }, className: "", textContent: "", title: "",
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild(c) { kids.push(c); return c; }, remove() {}, querySelectorAll() { return []; },
    addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    set innerHTML(v) {}, get innerHTML() { return ""; }, set outerHTML(v) {}, focus() {}
  };
}
function elFor(id) {
  if (elCache[id]) return elCache[id];
  const m = APP_HTML.match(new RegExp('<[a-z]+[^>]*\\bid="' + id + '"[^>]*>'));
  if (!m) return null;
  const vm = m[0].match(/\bvalue="([^"]*)"/);
  const el = genericEl();
  el.value = vm ? vm[1] : "";
  return (elCache[id] = el);
}
const appEl = { set innerHTML(v) { APP_HTML = v; elCache = {}; }, get innerHTML() { return APP_HTML; } };
const document = {
  addEventListener: on(L.doc), removeEventListener() {},
  getElementById(id) { return id === "app" ? appEl : elFor(id); },
  createElement: () => genericEl(),
  querySelectorAll() { return []; }, body: genericEl(), title: "", dispatchEvent() {}
};
const location = {
  _h: "", search: "",
  get hash() { return this._h; },
  set hash(v) { v = String(v); if (v && v[0] !== "#") v = "#" + v; if (this._h !== v) { this._h = v; fire(L.win, "hashchange"); } }
};
global.window = global;
global.document = document;
global.location = location;
global.addEventListener = on(L.win);
global.removeEventListener = () => {};
global.scrollTo = () => {};
global.scrollY = 0;
global.devicePixelRatio = 1;
global.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
global.requestAnimationFrame = (fn) => { setTimeout(fn, 0); return 1; };
global.cancelAnimationFrame = () => {};

/* ---------- boot the app, script-tag order ---------- */
for (const f of ["js/i18n.js", "js/ui.js", "js/db.js", "js/api-config.js", "js/auth.js", "js/data.js", "js/provision.js", "js/devices.js",
  "js/screens/authviews.js", "js/screens/dbviews.js", "js/screens/reports.js",
  "js/screens/staff.js", "js/screens/manager.js", "js/screens/hr.js", "js/screens/ceo.js", "js/screens/sysadmin.js", "js/app.js"]) eval(code(f));
fire(L.win, "DOMContentLoaded");

/* ---------- drive it like a user ---------- */
const target = (attr, val) => ({ closest: (sel) => (sel.includes("[data-" + attr + "]") ? { getAttribute: () => val, parentElement: genericEl(), setAttribute() {}, classList: { toggle() {} } } : null) });
const clickAct = (act) => fire(L.doc, "click", { target: target("act", act) });
const clickGo = (go) => fire(L.doc, "click", { target: target("go", go) });
const typeInto = (id, v) => { const el = document.getElementById(id); ok(!!el, "missing input #" + id); if (el) el.value = v; };

// 1 · the persona page lands FIRST (portal on, no session)
ok(location.hash === "#/launcher", "landing: expected #/launcher, got " + location.hash);
ok(document.body.dataset.portal !== "1", "landing: portal wall must not cover the persona page");
ok(APP_HTML.includes("hub-grid") && APP_HTML.includes("persona-switch"), "landing: persona cards/menu missing");
ok(APP_HTML.includes("set-tier:professional"), "landing: tier toggle missing on top");
ok(APP_HTML.includes('data-go="login"'), "landing: Sign in shortcut missing");
// 1b · integrated sign-in section sits BELOW the 5 persona cards
ok(APP_HTML.includes("landing-auth") && APP_HTML.includes("lp-frame"), "landing: sign-in section missing");
ok(APP_HTML.indexOf("hub-grid") < APP_HTML.indexOf("landing-auth"), "landing: sign-in section must come after the persona cards");
ok(APP_HTML.includes('value="staff123"') && APP_HTML.includes('data-act="auth-login-p:hr"'), "landing: frames not pre-filled / clickable");
// 1c · signing in straight from the landing page works
typeInto("lp-acc-staff", "staff2@phoungern.la");
typeInto("lp-pw-staff", "staff123");
clickAct("auth-login-p:staff");
ok(!!AUTH.session() && AUTH.session().email === "staff2@phoungern.la", "landing login: staff2 session missing");
ok(document.body.dataset.persona === "staff" && DATA.me.staff.id === "EMP-0231", "landing login: lens should follow staff2 (EMP-0231)");
location.hash = "#/launcher"; // signed-in landing shows the session bar instead of frames
ok(APP_HTML.includes("la-session") && APP_HTML.includes("staff2@phoungern.la"), "landing: session bar missing when signed in");
ok(!APP_HTML.includes("lp-frame"), "landing: frames should hide once signed in");
ok(APP_HTML.includes("Open my workspace") && APP_HTML.includes("auth-logout"), "landing: session bar actions missing");
clickAct("auth-logout"); // back to signed-out for the rest of the walk
ok(!AUTH.session(), "landing: logout from session bar failed");
location.hash = "#/launcher";

// 2 · entering a persona raises the wall, focused on that frame
clickGo("hr/web/pulse");
ok(document.body.dataset.portal === "1", "wall: portal did not rise on persona entry");
ok(APP_HTML.includes("lp-frame"), "wall: persona frames missing");
ok(APP_HTML.includes("lp-frame focus") && AUTHV.state.focus === "hr", "wall: hr frame not focused");
ok(APP_HTML.includes('value="hr123456"') && APP_HTML.includes('value="staff123"'), "wall: demo passwords not pre-filled");
ok(APP_HTML.includes('data-go="launcher"'), "wall: return-to-persona-page link missing (2.2)");
ok(!APP_HTML.includes('id="ink"') && !APP_HTML.includes("ink-bar"), "wall: background effect should be gone");

// 2b · the return link really goes back, and the wall rises again on next entry
clickGo("launcher");
ok(document.body.dataset.portal !== "1" && APP_HTML.includes("hub-grid"), "return: persona page did not come back");
clickGo("hr/web/pulse");
ok(document.body.dataset.portal === "1", "return: wall did not rise again");

// 3 · one click in the HR frame (pre-filled) → lands on HR pulse, staff lens follows
typeInto("lp-acc-hr", "hr@phoungern.la");
typeInto("lp-pw-hr", "hr123456");
clickAct("auth-login-p:hr");
ok(!!AUTH.session() && AUTH.session().email === "hr@phoungern.la", "login: hr@ session missing");
ok(location.hash === "#/hr/web/pulse", "landing: expected #/hr/web/pulse, got " + location.hash);
ok(document.body.dataset.persona === "hr", "landing: persona accent not hr");
ok(DATA.me.staff.id === "EMP-0021", "lens: staff lens did not follow hr@ (EMP-0021)");
ok(APP_HTML.includes("auth-logout"), "topbar: logout control missing");

// 4 · 2.1 — only their profile base: out-of-scope persona bounces back; tier toggle still visible
location.hash = "#/manager/web/overview";
ok(document.body.dataset.persona === "hr", "scope: manager route should bounce hr@ back (no manager scope)");
ok(APP_HTML.includes("set-tier:professional"), "tier: toggle must stay available after login (2.1)");
location.hash = "#/ceo/web/board";
ok(document.body.dataset.persona === "", "tier: ceo route on Essential should fall to the launcher (locked preview)");

// 5 · My security · outbox · access · person card
location.hash = "#/hr/web/security";
ok(APP_HTML.includes("My sessions") && APP_HTML.includes(AUTH.session().id), "security: session row missing");
location.hash = "#/hr/web/outbox/MAIL-0200";
ok(APP_HTML.includes("TOK-SEED-DAVONE"), "outbox: seeded invite link missing");
ok(APP_HTML.includes("ສະບາຍດີ"), "outbox: Lao body missing");
location.hash = "#/hr/web/access";
ok(APP_HTML.includes("Invite funnel") && APP_HTML.includes("davone@phoungern.la"), "access: funnel/pending missing");
location.hash = "#/hr/web/person/EMP-0214";
ok(APP_HTML.includes("Access — portal option") && APP_HTML.includes("staff@phoungern.la"), "person: access card missing for account holder");

// 6 · 2.3 — logoff returns to the login page
clickAct("auth-logout");
ok(!AUTH.session(), "logout: session survived");
ok(location.hash === "#/login" && document.body.dataset.portal === "1" && APP_HTML.includes("lp-frame"), "logout: must return to the login page (2.3)");

// 7 · tier flip on the login card, then Sys Admin frame on Pro
clickAct("set-tier:professional");
ok(APP_HTML.includes("lp-frame"), "tier flip on portal lost the frames");
typeInto("lp-acc-sysadmin", "sysadmin@phoungern.la");
typeInto("lp-pw-sysadmin", "sysadmin123");
clickAct("auth-login-p:sysadmin");
ok(!!AUTH.session() && document.body.dataset.persona === "sysadmin", "login: sysadmin@ failed on Pro");
location.hash = "#/sysadmin/web/identity";
ok(APP_HTML.includes("Identity console") && APP_HTML.includes("davone@phoungern.la"), "console: directory missing");
ok(APP_HTML.includes("LDAP / AD") && APP_HTML.includes("Built · Pro"), "console: v2.4.1 built LDAP/AD row missing");
ok(APP_HTML.includes("auth_mode") && APP_HTML.includes("Directory providers"), "console: edge-identity (auth_mode + providers) entry missing");

// 8 · activation route pre-session → frame pre-selects the new account
clickAct("auth-logout");
location.hash = "#/activate/TOK-SEED-DAVONE";
ok(APP_HTML.includes("davone@phoungern.la") && APP_HTML.includes("ac-pw"), "activate: page did not render for seeded token");
typeInto("ac-pw", "davone123"); typeInto("ac-pw2", "davone123");
clickAct("auth-activate:TOK-SEED-DAVONE");
ok(AUTH.account("davone@phoungern.la").status === "active", "activate: account not active");
ok(location.hash === "#/login", "activate: should hand off to sign-in");
ok(APP_HTML.includes('value="davone@phoungern.la" data-pw="" selected') || /value="davone@phoungern\.la"[^>]*selected/.test(APP_HTML), "activate: davone not pre-selected in the staff frame");
typeInto("lp-acc-staff", "davone@phoungern.la");
typeInto("lp-pw-staff", "davone123");
clickAct("auth-login-p:staff");
ok(!!AUTH.session() && AUTH.session().email === "davone@phoungern.la", "login: davone sign-in failed");
ok(document.body.dataset.persona === "staff" && DATA.me.staff.id === "EMP-0244", "landing: davone should land on staff + lens EMP-0244");

// 9 · new users appear in their persona frame for the next visitor
clickAct("auth-logout");
ok(/lp-acc-staff[\s\S]*davone@phoungern\.la/.test(APP_HTML), "frames: newly created user missing from the staff frame list");

// 10 · front-door mode — Open demo drops the wall, and the way back is visible
ok(APP_HTML.includes('data-act="portal-mode:off"'), "mode: login page must carry the front-door seg");
clickAct("portal-mode:off");
ok(!AUTH.portalOn(), "mode: Open demo failed");
clickAct("portal-mode:off"); // idempotent — pressing the active side is a no-op
ok(!AUTH.portalOn(), "mode: double-press flipped the flag");
location.hash = "#/launcher";
ok(APP_HTML.includes("landing-auth") && APP_HTML.includes("Turn the portal on"), "flag off: launcher must offer the re-arm card");
ok(!APP_HTML.includes("lp-frame"), "flag off: frames should not render in open-demo mode");
ok(APP_HTML.includes('data-act="portal-mode:on"'), "flag off: re-arm control missing");
ok(APP_HTML.includes("seg-login off") || APP_HTML.includes('class="seg-login off"'), "flag off: topbar Portal-off chip missing");
location.hash = "#/staff/web/home";
ok(document.body.dataset.portal !== "1" && document.body.dataset.persona === "staff", "flag off: persona should open without the wall");
ok(APP_HTML.includes('data-act="portal-mode:on"'), "flag off: re-arm chip must ride the topbar on app screens too");
location.hash = "#/launcher";
clickAct("portal-mode:on"); // re-arm from the persona page — the missing path, now one click
ok(AUTH.portalOn(), "mode: re-arm from launcher failed");
ok(APP_HTML.includes("lp-frame"), "mode: frames should return once the portal is back on");

console.log("portal-smoke: " + (errors.length ? "FAIL\n  " + errors.join("\n  ") : "ALL CHECKS PASS — persona-page landing · wall on entry · frame login (pre-filled) · scope bounce · tier toggle · security · outbox · console · activation handoff · logout→login · flag"));
process.exit(errors.length ? 1 : 0);
