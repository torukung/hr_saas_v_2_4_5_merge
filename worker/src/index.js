// index.js — Adeptio edge auth Worker (v2.4.1.edge.auth · B1/B2/B3/B4).
//
// The server-authoritative identity service. The SPA (auth_mode=remote) calls these
// endpoints; the Worker owns the credentials (Argon2id in Turso), binds LDAP/AD and RADIUS
// over connect(), and hands back an httpOnly session cookie. The browser never sees a hash.
//
// Endpoints (the 8 core + provisioning):
//   POST /auth/verify           {email,password}            → set session cookie, {ok,name,emp,scopes,mode}
//   GET  /auth/me                                            → current session profile (no hash)
//   POST /auth/signout                                       → clear session
//   POST /auth/invite           {email,name,scope}          → invited account + invite mail
//   POST /auth/activate         {token,password}            → set local password (Argon2id), activate
//   POST /auth/reset/request    {email}                     → reset mail (no account enumeration)
//   POST /auth/reset/complete   {token,password}            → set new local password
//   POST /auth/set-password     {token,password}            → finish a directory→local switch
//   POST /auth/mode             {email,mode}                → switch credential mode (B2)
//   POST /provision/import      {rows:[...],mode}           → bulk create (B5 seam)
//   POST /provision/provider    {id,type,host,baseDN,...}   → author the real LDAP/RADIUS config (admin session)
//   POST /__seed                (guarded)                   → seed the demo roster (Argon2id), first deploy
//   POST /__mailtest            (guarded)                   → prove SMTP end-to-end
//
// Config (wrangler vars): ALLOWED_ORIGIN, AUTH_MODE, MAIL_PROVIDER, SMTP_*, MAIL_FROM,
//   LDAP_HOST, LDAP_TRANSPORT, LDAP_USER_DN_TEMPLATE, RADIUS_HOST.
// Secrets: TURSO_URL? (var ok) TURSO_TOKEN, PASSWORD_PEPPER, RADIUS_SECRET, SMTP_USER,
//   SMTP_PASS, MAILTEST_TOKEN, SEED_TOKEN.

import { makeStore } from "./turso.js";
import { hashPassword, verifyPassword, legacyMatches } from "./argon2.js";
import { sessionCookie, readSidCookie, newSessionId, newTokenId } from "./sessions.js";
import { ldapBind } from "./ldap.js";
import { radiusAccessRequest } from "./radius.js";
import { sendAuthMail } from "./mail-relay.js";
import { handlePunch } from "./punch.js";

const POLICY = { minLen: 8, lockoutFails: 5, lockoutMins: 15, idleMins: 30, inviteHours: 72, resetMins: 30, setpwHours: 72 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const nowISO = () => new Date().toISOString();
const scopesFor = (s) => (s === "manager" ? ["manager", "staff"] : s === "hr" ? ["hr", "staff"] : [s || "staff"]);

let _schemaReady = false;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") || "";
    if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }), env, origin);

    try {
      const store = makeStore(env);
      if (!_schemaReady) { await store.ensureSchema(); _schemaReady = true; }
      const res = await route(url, req, env, store);
      return cors(res, env, origin);
    } catch (e) {
      return cors(json({ ok: false, code: "edge_error", msg: "Edge error: " + (e && e.message) }, 500), env, origin);
    }
  },
};

async function route(url, req, env, store) {
  const p = url.pathname;

  // v2.4.2 — device capture ingestion (Lane A push + custom webhook). Handled BEFORE the
  // JSON body parse below, because ZKTeco ADMS posts tab-delimited text, not JSON.
  if (p === "/punch" || p.startsWith("/punch/")) return handlePunch(url, req, env, store);

  const body = req.method === "POST" ? await safeBody(req) : {};

  if (p === "/" ) return text("Adeptio edge auth Worker — v2.4.2.edge.auth (B1–B4 + /punch device capture). See /worker/README.md.");
  if (p === "/auth/verify" && req.method === "POST") return verify(body, env, store);
  if (p === "/auth/me") return me(req, store);
  if (p === "/auth/signout" && req.method === "POST") return signout(req, store);
  if (p === "/auth/invite" && req.method === "POST") return invite(body, env, store);
  if (p === "/auth/activate" && req.method === "POST") return activate(body, env, store);
  if (p === "/auth/reset/request" && req.method === "POST") return resetRequest(body, env, store);
  if (p === "/auth/reset/complete" && req.method === "POST") return resetComplete(body, env, store);
  if (p === "/auth/set-password" && req.method === "POST") return setPassword(body, env, store);
  if (p === "/auth/mode" && req.method === "POST") return switchMode(body, env, store);
  if (p === "/provision/import" && req.method === "POST") return provisionImport(body, env, store);
  if (p === "/provision/provider" && req.method === "POST") return provisionProvider(req, body, env, store);
  if (p === "/__seed" && req.method === "POST") return seed(req, env, store);
  if (p === "/__mailtest" && req.method === "POST") return mailtest(url, req, env, store);
  return json({ ok: false, code: "not_found", msg: "No such endpoint." }, 404);
}

/* ---------- providers from env ---------- */
const ldapProvider = (env) => ({ host: env.LDAP_HOST, transport: env.LDAP_TRANSPORT || "ldaps", userDNTemplate: env.LDAP_USER_DN_TEMPLATE });
const radiusSecret = (env) => env.RADIUS_SECRET || "";
const radiusProvider = (env) => ({ host: env.RADIUS_HOST });

/* ---------- core: verify ---------- */
async function verify(body, env, store) {
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const acc = await store.account(email);
  if (!acc) return json({ ok: false, code: "unknown", msg: "No account for that address." }, 401);
  if (acc.status === "invited") return json({ ok: false, code: "invited", msg: "Activate your account first." }, 403, acc);
  if (acc.status === "pending") return json({ ok: false, code: "pending", msg: "Set a local password to finish." }, 403, acc);
  if (acc.status === "disabled") return json({ ok: false, code: "disabled", msg: "Access is switched off." }, 403, acc);
  if (acc.locked_until && Date.now() < acc.locked_until)
    return json({ ok: false, code: "locked", msg: "Locked after too many attempts.", remainMs: acc.locked_until - Date.now() }, 429);

  const mode = acc.mode || "local";
  let pass = false, rehash = null;
  try {
    if (mode === "local") {
      const v = await verifyPassword(password, acc.secret_hash, env);
      if (v.ok) pass = true;
      else if (v.legacy && (await legacyMatches(email, password, acc.secret_hash))) { pass = true; rehash = await hashPassword(password, env); }
    } else if (mode === "ldap") {
      const prov = (await store.providerByType("ldap")) || ldapProvider(env); // SPA-authored config wins, env is the fallback
      const r = await ldapBind(prov, email, password);
      pass = r.ok;
    } else if (mode === "radius") {
      const prov = (await store.providerByType("radius")) || radiusProvider(env);
      const r = await radiusAccessRequest(prov, email, password, radiusSecret(env)); // secret stays an env secret
      pass = r.ok;
    }
  } catch (e) {
    await store.audit("system", "auth.directory_unreachable", email + " · " + mode + " · " + (e && e.message), "edge");
    return json({ ok: false, code: "directory_down", msg: "The company " + mode.toUpperCase() + " directory is unreachable — sign-in fails closed (D2). A break-glass local admin can still get in." }, 503);
  }

  if (!pass) {
    const fails = (acc.fails || 0) + 1;
    if (fails >= POLICY.lockoutFails) {
      await store.patchAccount(email, { fails: 0, locked_until: Date.now() + POLICY.lockoutMins * 60000 });
      await store.audit("system", "auth.lockout", email + " · " + POLICY.lockoutMins + " min", "edge");
      try { await sendAuthMail(env, { kind: "reset", to: email, vars: { name: acc.name, link: "#/login" }, recordOutbox: outboxHook(store) }); } catch (e) { /* mail optional */ }
      return json({ ok: false, code: "locked", msg: "Locked after " + POLICY.lockoutFails + " failed attempts." }, 429);
    }
    await store.patchAccount(email, { fails });
    await store.audit("system", "auth.login_failed", email + " · attempt " + fails + "/" + POLICY.lockoutFails, "edge");
    return json({ ok: false, code: "badpw", msg: "Wrong password — attempt " + fails + " of " + POLICY.lockoutFails + "." }, 401);
  }

  // success
  const patch = { fails: 0, locked_until: 0, last_login: nowISO() };
  if (rehash) patch.secret_hash = rehash;
  if (mode !== "local" && acc.hash_pending_purge) { patch.secret_hash = null; patch.hash_pending_purge = false; await store.audit("system", "auth.credential.hash_purged", email + " · after first " + mode + " bind", "edge"); }
  await store.patchAccount(email, patch);

  const sid = newSessionId();
  await store.createSession({ id: sid, email, name: acc.name, emp: acc.emp, scopes: acc.scopes, started: nowISO(), seen: Date.now(), device: "edge · this device" });
  await store.audit(acc.name, "auth.login", email + " → " + acc.scopes.join("+") + " · edge/" + mode, "edge");
  return json({ ok: true, name: acc.name, emp: acc.emp, scopes: acc.scopes, mode }, 200, null, { "Set-Cookie": sessionCookie(sid) });
}

/* ---------- me / signout ---------- */
async function me(req, store) {
  const sid = readSidCookie(req);
  if (!sid) return json({ ok: false, code: "nosession" }, 401);
  const s = await store.session(sid);
  if (!s) return json({ ok: false, code: "nosession" }, 401);
  if (Date.now() - s.seen > POLICY.idleMins * 60000) { await store.dropSession(sid); return json({ ok: false, code: "expired" }, 401, null, { "Set-Cookie": sessionCookie("", { clear: true }) }); }
  await store.touchSession(sid, Date.now());
  return json({ ok: true, email: s.email, name: s.name, emp: s.emp, scopes: s.scopes });
}
async function signout(req, store) {
  const sid = readSidCookie(req);
  if (sid) { const s = await store.session(sid); await store.dropSession(sid); if (s) await store.audit(s.name, "auth.logout", s.email, "edge"); }
  return json({ ok: true }, 200, null, { "Set-Cookie": sessionCookie("", { clear: true }) });
}

/* ---------- invite / activate ---------- */
async function invite(body, env, store) {
  const email = String(body.email || "").trim().toLowerCase();
  if (!EMAIL.test(email)) return json({ ok: false, msg: "A valid e-mail is required." }, 400);
  const scopes = scopesFor(body.scope);
  await store.upsertAccount({ email, name: body.name || email, emp: body.emp || "", scopes, status: "invited", mode: "local", secret_hash: null, created: nowISO() });
  const tok = newTokenId("invite");
  await store.createToken({ id: tok, kind: "invite", email, created: nowISO(), expires: Date.now() + POLICY.inviteHours * 3600000 });
  await store.audit("HR", "auth.invited", email + " · " + scopes[0], "edge");
  try { await sendAuthMail(env, { kind: "invite", to: email, vars: { name: body.name || email, org: "Adeptio", link: activateLink(env, tok) }, recordOutbox: outboxHook(store) }); } catch (e) { /* mail optional in local mode */ }
  return json({ ok: true, token: tok });
}
async function activate(body, env, store) {
  const tk = await validToken(store, body.token, "invite");
  if (!tk.ok) return json(tk, 400);
  const pc = policyCheck(body.password); if (!pc.ok) return json({ ok: false, msg: pc.msg }, 400);
  const hash = await hashPassword(body.password, env);
  await store.patchAccount(tk.tk.email, { secret_hash: hash, status: "active", mode: "local", fails: 0, locked_until: 0 });
  await store.useToken(tk.tk.id);
  await store.audit(tk.tk.email, "auth.activated", tk.tk.email, "edge");
  try { await sendAuthMail(env, { kind: "activate", to: tk.tk.email, vars: { name: tk.tk.email, org: "Adeptio", link: loginLink(env) }, recordOutbox: outboxHook(store) }); } catch (e) {}
  return json({ ok: true });
}

/* ---------- reset ---------- */
async function resetRequest(body, env, store) {
  const email = String(body.email || "").trim().toLowerCase();
  const acc = await store.account(email);
  if (acc && acc.status === "active" && (acc.mode || "local") === "local") {
    const tok = newTokenId("reset");
    await store.createToken({ id: tok, kind: "reset", email, created: nowISO(), expires: Date.now() + POLICY.resetMins * 60000 });
    await store.audit("system", "auth.reset_requested", email, "edge");
    try { await sendAuthMail(env, { kind: "reset", to: email, vars: { name: acc.name, link: resetLink(env, tok) }, recordOutbox: outboxHook(store) }); } catch (e) {}
  }
  return json({ ok: true, msg: "If that address has a local account, a reset link is on its way." }); // no enumeration
}
async function resetComplete(body, env, store) {
  const tk = await validToken(store, body.token, "reset");
  if (!tk.ok) return json(tk, 400);
  const pc = policyCheck(body.password); if (!pc.ok) return json({ ok: false, msg: pc.msg }, 400);
  const hash = await hashPassword(body.password, env);
  await store.patchAccount(tk.tk.email, { secret_hash: hash, status: "active", mode: "local", fails: 0, locked_until: 0 });
  await store.useToken(tk.tk.id);
  await store.audit(tk.tk.email, "auth.reset_completed", tk.tk.email, "edge");
  return json({ ok: true });
}

/* ---------- set-password (directory → local) ---------- */
async function setPassword(body, env, store) {
  const tk = await validToken(store, body.token, "setpw");
  if (!tk.ok) return json(tk, 400);
  const pc = policyCheck(body.password); if (!pc.ok) return json({ ok: false, msg: pc.msg }, 400);
  const hash = await hashPassword(body.password, env);
  await store.patchAccount(tk.tk.email, { secret_hash: hash, status: "active", mode: "local", fails: 0, locked_until: 0 });
  await store.useToken(tk.tk.id);
  await store.audit(tk.tk.email, "auth.credential.set_local", tk.tk.email, "edge");
  return json({ ok: true });
}

/* ---------- B2 · mode switch ---------- */
async function switchMode(body, env, store) {
  const email = String(body.email || "").trim().toLowerCase();
  const mode = ["local", "ldap", "radius"].includes(body.mode) ? body.mode : "local";
  const acc = await store.account(email);
  if (!acc) return json({ ok: false, msg: "No account." }, 404);
  if (acc.break_glass && mode !== "local") return json({ ok: false, msg: "Break-glass admin must stay local." }, 400);
  const cur = acc.mode || "local";
  if (cur === mode) return json({ ok: true, noop: true });
  if (mode === "local") {
    await store.patchAccount(email, { mode: "local", secret_hash: null, hash_pending_purge: false, status: "pending", fails: 0, locked_until: 0 });
    await store.dropSessionsFor(email);
    const tok = newTokenId("setpw");
    await store.createToken({ id: tok, kind: "setpw", email, created: nowISO(), expires: Date.now() + POLICY.setpwHours * 3600000 });
    await store.audit("admin", "auth.credential.mode_changed", email + " · " + cur + " → local · pending", "edge");
    try { await sendAuthMail(env, { kind: "setPassword", to: email, vars: { name: acc.name, link: setpwLink(env, tok), reason: "mode switch" }, recordOutbox: outboxHook(store) }); } catch (e) {}
    return json({ ok: true, token: tok });
  }
  await store.patchAccount(email, { mode, status: "active", hash_pending_purge: acc.secret_hash ? true : false, fails: 0, locked_until: 0 });
  await store.audit("admin", "auth.credential.mode_changed", email + " · " + cur + " → " + mode, "edge");
  return json({ ok: true });
}

/* ---------- B5 · provision import (thin create seam) ---------- */
async function provisionImport(body, env, store) {
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const batchMode = ["local", "ldap", "radius"].includes(body.mode) ? body.mode : "local";
  let created = 0, linked = 0, errors = 0;
  for (const r of rows) {
    const email = String(r.email || "").trim().toLowerCase();
    if (!EMAIL.test(email)) { errors++; continue; }
    const mode = ["local", "ldap", "radius"].includes(r.mode) ? r.mode : batchMode;
    const exists = await store.account(email);
    if (exists) { await store.patchAccount(email, { mode }); linked++; continue; }
    await store.upsertAccount({ email, name: r.name || email, emp: r.emp || "", scopes: scopesFor(r.scope), status: mode === "local" ? "invited" : "active", mode, secret_hash: null, created: nowISO() });
    if (mode === "local") { const tok = newTokenId("invite"); await store.createToken({ id: tok, kind: "invite", email, created: nowISO(), expires: Date.now() + POLICY.inviteHours * 3600000 }); }
    created++;
  }
  await store.audit("HR", "import.batch", "rows " + rows.length + " · +" + created + " / link " + linked + " / err " + errors, "edge");
  return json({ ok: true, created, linked, errors });
}

/* ---------- B3/B4 · author the real LDAP/RADIUS connection (non-secret, runtime) ---------- */
async function currentAdmin(req, store) {
  const sid = readSidCookie(req);
  if (!sid) return null;
  const s = await store.session(sid);
  if (!s || Date.now() - s.seen > POLICY.idleMins * 60000) return null;
  return (s.scopes || []).includes("sysadmin") || (s.scopes || []).includes("hr") ? s : null;
}
async function provisionProvider(req, body, env, store) {
  const admin = await currentAdmin(req, store);
  if (!admin) return json({ ok: false, code: "forbidden", msg: "An admin (sysadmin/hr) session is required to change a provider." }, 403);
  if (!body.id || !["ldap", "radius"].includes(body.type)) return json({ ok: false, msg: "id and a valid type (ldap|radius) are required." }, 400);
  // only NON-SECRET fields are accepted here — the bind secret never travels this path.
  await store.upsertProvider({ id: body.id, type: body.type, host: body.host, transport: body.transport, baseDN: body.baseDN, bindDN: body.bindDN, userDNTemplate: body.userDNTemplate, userAttr: body.userAttr });
  await store.audit(admin.name, "auth.provider_changed", body.id + " · " + (body.host || ""), "edge");
  return json({ ok: true });
}

/* ---------- guarded ops ---------- */
async function seed(req, env, store) {
  if (!env.SEED_TOKEN || req.headers.get("x-seed-token") !== env.SEED_TOKEN) return text("forbidden", 403);
  const roster = [
    ["staff@phoungern.la", "Souksavanh Phommachanh", "EMP-0214", "staff", "staff123"],
    ["manager@phoungern.la", "Khamla Sisouphanh", "EMP-0098", "manager", "manager123"],
    ["hr@phoungern.la", "Vilayvanh Chanthavong", "EMP-0021", "hr", "hr123456"],
    ["sysadmin@phoungern.la", "Thip Norasing", "ADM-0002", "sysadmin", "sysadmin123", true],
  ];
  for (const [email, name, emp, scope, pw, bg] of roster) {
    await store.upsertAccount({ email, name, emp, scopes: scopesFor(scope), status: "active", mode: "local", secret_hash: await hashPassword(pw, env), created: nowISO(), break_glass: !!bg });
  }
  // seed the provider connection config from env (the admin edits it live in the SPA afterwards)
  await store.upsertProvider({ id: "PROV-AD", type: "ldap", host: env.LDAP_HOST || "ad.phoungern.la:636", transport: env.LDAP_TRANSPORT || "ldaps", baseDN: "DC=phoungern,DC=la", bindDN: "", userDNTemplate: env.LDAP_USER_DN_TEMPLATE || "", userAttr: "userPrincipalName" });
  await store.upsertProvider({ id: "PROV-RAD", type: "radius", host: env.RADIUS_HOST || "nps.phoungern.la:2083", transport: "radsec" });
  await store.audit("system", "seed.roster", roster.length + " demo accounts (Argon2id) + 2 providers", "edge");
  return json({ ok: true, seeded: roster.length, providers: 2 });
}
async function mailtest(url, req, env, store) {
  if (!env.MAILTEST_TOKEN || req.headers.get("x-mailtest-token") !== env.MAILTEST_TOKEN) return text("forbidden", 403);
  const to = url.searchParams.get("to") || env.SMTP_USER;
  try {
    const result = await sendAuthMail(env, { kind: "invite", to, vars: { name: "Test", org: "Adeptio", link: "https://example.com/activate?token=demo" }, recordOutbox: outboxHook(store) });
    return json({ ok: true, result });
  } catch (e) { return text("mailtest error: " + (e && e.message), 500); }
}

/* ---------- helpers ---------- */
const outboxHook = (store) => (row) => store.audit("mailer", "mail.sent", row.kind + " → " + row.to + " · " + row.mode, "edge");
async function validToken(store, id, kind) {
  const tk = await store.token(id);
  if (!tk) return { ok: false, msg: "Unknown link." };
  if (tk.used) return { ok: false, msg: "This link was already used." };
  if (Date.now() > tk.expires) return { ok: false, msg: "This link expired." };
  if (tk.kind !== kind) return { ok: false, msg: "Wrong link type." };
  return { ok: true, tk };
}
function policyCheck(pw) { pw = String(pw || ""); return pw.length >= POLICY.minLen ? { ok: true } : { ok: false, msg: "At least " + POLICY.minLen + " characters." }; }
const appBase = (env) => (env.ALLOWED_ORIGIN || "").replace(/\/+$/, "");
const activateLink = (env, tok) => appBase(env) + "/#/activate/" + tok;
const resetLink = (env, tok) => appBase(env) + "/#/reset/" + tok;
const setpwLink = (env, tok) => appBase(env) + "/#/setpw/" + tok;
const loginLink = (env) => appBase(env) + "/#/login";

async function safeBody(req) { try { return await req.json(); } catch (e) { return {}; } }
function json(obj, status = 200, _acc, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...extraHeaders } });
}
function text(s, status = 200) { return new Response(s, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } }); }
function cors(res, env, origin) {
  const allow = env.ALLOWED_ORIGIN || origin || "*";
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", allow);
  h.set("Access-Control-Allow-Credentials", "true");
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, x-mailtest-token, x-seed-token");
  h.set("Vary", "Origin");
  return new Response(res.body, { status: res.status, headers: h });
}
