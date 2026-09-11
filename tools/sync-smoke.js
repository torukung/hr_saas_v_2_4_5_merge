/* Sync smoke test — drives js/d1-sync.js against an in-memory mock of the
   Cloudflare Worker (worker/src/v245.js) and verifies the local-first → D1
   replication contract (v2.4.5.1):
     (a) a local change is PUT to D1 (and the push is audited locally),
     (b) db_identity is NEVER PUT (custody — client skips, mock 403s),
     (c) a strictly-newer remote store is PULLED and hydrates (no echo loop),
     (d) the audit→dirty loop settles (no endless re-push),
     (e) db_audit is NEVER PUT (append-only ledger — excluded from sync).
   Also asserts the NEW contract: every /api/sync call carries a Bearer token
   (mock 401s otherwise), the PUT is a compare-and-swap on `base`/`updated`,
   DB.markSynced advances sv so the next push carries the fresh base, and a
   409 (server moved) makes the client drop its push and take the server copy.
   Pure node — no real network, no real D1.
   Run: node tools/sync-smoke.js .                                            */
const fs = require("fs"), path = require("path");
const ROOT = process.argv[2] || ".";
global.window = global;
const code = f => fs.readFileSync(path.join(ROOT, f), "utf8");

/* db.js evals on its own (no sync layer). */
eval(code("js/db.js"));

/* localStorage shim (outbox + envelopes live here). */
global.localStorage = { _m: {}, getItem(k) { return k in this._m ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };

/* Keep the boot guard FALSE so nothing auto-fetches / schedules a timer:
   d1-sync.js boots only when (enabled && typeof document !== "undefined").
   We drive flush()/pull() by hand. */
global.document = undefined;
global.navigator = { onLine: true };

/* ---------- mock Worker: server[store] = { store, tables:{...}, v, updated } ----------
   NEW contract: Bearer-gated + compare-and-swap. Rows start implicitly at
   updated=0 (unseen), so the first push (base 0) succeeds; every accepted
   PUT bumps `updated` to a strictly-larger value and 409s if the client's
   base no longer matches the live row. */
const TOKEN = "test-token";
const server = {};
let authHits = 0, authMisses = 0;
const resp = (obj, ok = true, status = 200) => ({ ok, status, json: async () => obj });
global.fetch = async (url, opts) => {
  const u = new URL(url);
  const p = u.pathname.replace(/\/+$/, "");
  const method = (opts && opts.method) || "GET";
  const mOne = p.match(/^\/api\/sync\/(db_[a-z]+|dw_reports)$/);

  if (p === "/api/health") return resp({ ok: true, stores: Object.keys(server).length });

  /* AUTH GATE — fail-closed: every /api/sync[/:store] call must carry the Bearer token. */
  if (p === "/api/sync" || mOne) {
    const h = (opts && opts.headers) || {};
    const auth = h.Authorization || h.authorization || "";
    if (auth !== "Bearer " + TOKEN) { authMisses++; return resp({ ok: false, err: "unauthorized" }, false, 401); }
    authHits++;
  }

  if (p === "/api/sync" && method === "GET") {
    return resp({
      ok: true,
      // CRITICAL: tables is a JSON STRING (frozen contract — client must JSON.parse it)
      stores: Object.values(server).map(r => ({ store: r.store, tables: JSON.stringify(r.tables), v: r.v, updated: r.updated }))
    });
  }

  if (mOne) {
    const store = mOne[1];
    if (store === "db_identity") return resp({ ok: false, err: "db_identity is never accepted from the client (custody)" }, false, 403);
    if (method === "GET") {
      const r = server[store];
      return r ? resp({ ok: true, store: { store: r.store, tables: JSON.stringify(r.tables), v: r.v, updated: r.updated } })
               : resp({ ok: false, err: "unknown store" }, false, 404);
    }
    if (method === "PUT") {
      const body = JSON.parse(opts.body);            // { tables, v, base }
      if (!body || typeof body.tables !== "object") return resp({ ok: false, err: "expected { tables, v, base }" }, false, 400);
      const cur = server[store];
      const curUpdated = cur ? cur.updated : 0;      // unseen row behaves as updated=0 → first push (base 0) wins
      const base = Number(body.base || 0);
      if (curUpdated !== base) {
        // CAS miss — the server row moved under the client. 409, server wins.
        return resp({ ok: false, conflict: true, store, updated: curUpdated }, false, 409);
      }
      const next = Math.max(curUpdated + 1, Date.now());   // strictly larger than base
      server[store] = { store, tables: body.tables, v: body.v || 12, updated: next };
      return resp({ ok: true, store, updated: next });
    }
  }
  return resp({ ok: false, err: "not found", path: p }, false, 404);
};

/* enable the new module via API_CONFIG (replaces the old TURSO_CONFIG).
   syncToken MUST be set before d1-sync.js evals — it reads CFG.syncToken then. */
window.API_CONFIG = { base: "https://mock.workers.dev", syncSeconds: 30, syncToken: TOKEN };
eval(code("js/d1-sync.js"));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ob = () => JSON.parse(localStorage.getItem("adeptio.v245.sync.outbox") || "[]");
async function drain() { for (let i = 0; i < 60 && ob().length; i++) { await SYNC.flush(); await sleep(15); } }

/* expected syncable store count, recomputed from the live CATALOG
   (stores − db_identity − db_audit) — never hard-coded. Both are excluded
   from the client sync path (credential custody + append-only ledger). */
const SYNCABLE = DB.CATALOG.filter(c => c.id !== "db_identity" && c.id !== "db_audit").length;

(async () => {
  const errors = [];
  if (!window.SYNC || typeof SYNC.flush !== "function") { console.log("FAIL\n- window.SYNC not defined after eval (node-safety regression?)"); process.exit(1); }
  if (SYNC.enabled !== true) errors.push("SYNC.enabled should be true when API_CONFIG.base is set");

  /* (a) a local change is PUT to D1 (and audited locally) --------------- */
  DB.add("db_people", "employees", { id: "EMP-7777", name: "Cloud Test", pos: "QA", div: "Admin", team: "—", state: "present", in: "08:00", attend: 100, ot: 0, leaveBal: 9, since: "Jun 2026" });
  await drain();
  if (!server.db_people) errors.push("(a) db_people was not PUT to D1");
  else if (!(server.db_people.tables.employees || []).some(r => r.id === "EMP-7777")) errors.push("(a) pushed row EMP-7777 missing in D1");
  if (!DB.list("db_audit", "events").some(e => e.act === "cloud.sync_pushed")) errors.push("(a) the push was not audited (no cloud.sync_pushed fact in db_audit)");
  if (ob().length) errors.push("(a) outbox did not drain: " + ob().join(","));

  /* CAS + markSynced: the SECOND push carries the fresh base and still lands */
  const svAfter1 = (DB.localMeta("db_people") || {}).sv || 0;
  if (svAfter1 <= 0) errors.push("(sv) markSynced did not advance sv after the first push");
  if (server.db_people && server.db_people.updated !== svAfter1) errors.push("(sv) client sv is out of step with the server 'updated' after push #1");
  DB.add("db_people", "employees", { id: "EMP-7778", name: "Second Push", pos: "QA", div: "Admin", team: "—", state: "present", in: "08:01", attend: 100, ot: 0, leaveBal: 9, since: "Jun 2026" });
  const upd1 = server.db_people ? server.db_people.updated : 0;
  await drain();
  if (!server.db_people || server.db_people.updated <= upd1) errors.push("(sv) second push did not advance the server row (CAS rejected the fresh base?)");
  else if (!(server.db_people.tables.employees || []).some(r => r.id === "EMP-7778")) errors.push("(sv) second-push row EMP-7778 missing in D1");
  if (((DB.localMeta("db_people") || {}).sv || 0) <= svAfter1) errors.push("(sv) sv did not advance after the second push");

  /* (b) db_identity is NEVER PUT (custody) ------------------------------ */
  // even if something enqueues it, the client must skip AND the mock would 403 it.
  SYNC.enqueue("db_identity");
  await drain();
  if (server.db_identity) errors.push("(b) custody: db_identity must NEVER be PUT to D1");
  if (Object.keys(server).some(s => s === "db_identity")) errors.push("(b) custody: identity store leaked to the cloud");

  /* (e) db_audit is NEVER PUT (append-only ledger — excluded from sync) - */
  SYNC.enqueue("db_audit");             // even if forced, the client must skip it
  await drain();
  if (server.db_audit) errors.push("(e) db_audit must NEVER be PUT (append-only ledger, excluded from sync)");
  if (ob().indexOf("db_audit") >= 0) errors.push("(e) db_audit lingered in the outbox (skip() should drop it)");

  /* (d) NO-ECHO / AUDIT-LOOP guard: a follow-up drain must settle ------- */
  await drain();                        // nothing queued → should be a no-op
  if (ob().length) errors.push("(d) outbox re-filled on an idle drain (echo loop)");

  /* CAS CONFLICT (409): server row moved → client drops the push, takes the server copy */
  const ahead = server.db_people.updated + 10000;   // server jumps ahead behind the client's back
  server.db_people = {
    store: "db_people",
    tables: Object.assign({}, DB.raw("db_people"), { employees: [{ id: "EMP-AHEAD", name: "Server Ahead", pos: "QA", div: "Admin", team: "—", state: "present", in: "08:00", attend: 100, ot: 0, leaveBal: 9, since: "Jun 2026" }] }),
    v: (DB.localMeta("db_people") || {}).v || 12,
    updated: ahead
  };
  DB.add("db_people", "employees", { id: "EMP-STALE", name: "Stale Local", pos: "QA", div: "Admin", team: "—", state: "present", in: "08:00", attend: 100, ot: 0, leaveBal: 9, since: "Jun 2026" });
  await SYNC.flush();                   // base (stale sv) ≠ server.updated → 409 → drop + fire pull
  await SYNC.pull();                    // deterministically settle the server-wins hydrate
  if (ob().indexOf("db_people") >= 0) errors.push("(conflict) 409 did not drop db_people from the outbox (would loop forever)");
  if (!DB.list("db_people", "employees").some(e => e.id === "EMP-AHEAD")) errors.push("(conflict) server-wins pull did not land the server copy");
  if (DB.list("db_people", "employees").some(e => e.id === "EMP-STALE")) errors.push("(conflict) stale local write survived a server-wins conflict");

  /* (c) a strictly-newer remote store is PULLED and hydrates (no echo) -- */
  const local = DB.raw("db_people");
  const v = (DB.localMeta("db_people") || {}).v || 12;   // MUST match SEED_VERSION or LWW pushes instead of pulls
  const newerT = Math.max(Date.now(), (DB.localMeta("db_people") || {}).t || 0) + 5000;   // strictly > local t
  server.db_people = {
    store: "db_people",
    tables: Object.assign({}, local, { employees: [{ id: "EMP-CLOUD", name: "Renamed In Cloud", pos: "QA", div: "Admin", team: "—", state: "present", in: "08:00", attend: 100, ot: 0, leaveBal: 9, since: "Jun 2026" }] }),
    v: v,
    updated: newerT
  };
  const r = await SYNC.pull();
  if ((r.pulled || []).indexOf("db_people") < 0) errors.push("(c) LWW did not pull the newer remote db_people");
  if (!DB.list("db_people", "employees").some(e => e.name === "Renamed In Cloud")) errors.push("(c) hydrate did not land the cloud copy");
  if (ob().indexOf("db_people") >= 0) errors.push("(c) pull echoed db_people back into the outbox");
  // confirm the just-hydrated store is NOT re-PUT by a follow-up drain (no echo back to D1)
  const updBefore = server.db_people.updated;
  await drain();
  if (server.db_people.updated !== updBefore) errors.push("(c) pull echoed back to D1 (store re-PUT after hydrate)");

  /* AUTH: the client must have sent a valid Bearer on every /api/sync call */
  if (authHits < 1) errors.push("(auth) client never sent an authorized /api/sync request");
  if (authMisses > 0) errors.push("(auth) client sent " + authMisses + " /api/sync request(s) without a valid Bearer token");

  console.log(errors.length ? ("FAIL\n- " + errors.join("\n- ")) : "SYNC ROUND-TRIP: ALL CHECKS PASS");
  console.log("syncable stores (from CATALOG):", SYNCABLE, "| stores in D1:", Object.keys(server).length);
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR", e); process.exit(1); });
