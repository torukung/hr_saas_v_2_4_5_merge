/* Sync smoke test — drives js/d1-sync.js against an in-memory mock of the
   Cloudflare Worker (worker/src/v245.js) and verifies the local-first → D1
   replication contract:
     (a) a local change is PUT to D1 (and the push is audited),
     (b) db_identity is NEVER PUT (custody — client skips, mock 403s),
     (c) a strictly-newer remote store is PULLED and hydrates (no echo loop),
     (d) the audit→dirty loop settles (no endless re-push).
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

/* ---------- mock Worker: server[store] = { store, tables:{...}, v, updated } ---------- */
const server = {};
const resp = (obj, ok = true, status = 200) => ({ ok, status, json: async () => obj });
global.fetch = async (url, opts) => {
  const u = new URL(url);
  const p = u.pathname.replace(/\/+$/, "");
  const method = (opts && opts.method) || "GET";
  const mOne = p.match(/^\/api\/sync\/(db_[a-z]+|dw_reports)$/);

  if (p === "/api/health") return resp({ ok: true, stores: Object.keys(server).length });

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
      const body = JSON.parse(opts.body);            // flat { tables, v }
      if (!body || typeof body.tables !== "object") return resp({ ok: false, err: "expected { tables, v }" }, false, 400);
      const now = Date.now();
      server[store] = { store, tables: body.tables, v: body.v || 12, updated: now };
      return resp({ ok: true, store, updated: now });
    }
  }
  return resp({ ok: false, err: "not found", path: p }, false, 404);
};

/* enable the new module via API_CONFIG (replaces the old TURSO_CONFIG). */
window.API_CONFIG = { base: "https://mock.workers.dev", syncSeconds: 30 };
eval(code("js/d1-sync.js"));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ob = () => JSON.parse(localStorage.getItem("adeptio.v245.sync.outbox") || "[]");
async function drain() { for (let i = 0; i < 60 && ob().length; i++) { await SYNC.flush(); await sleep(15); } }

/* expected non-identity store count, recomputed from the live CATALOG
   (15 stores − db_identity = 14) — never hard-coded. */
const NON_IDENTITY = DB.CATALOG.filter(c => c.id !== "db_identity").length;

(async () => {
  const errors = [];
  if (!window.SYNC || typeof SYNC.flush !== "function") { console.log("FAIL\n- window.SYNC not defined after eval (node-safety regression?)"); process.exit(1); }
  if (SYNC.enabled !== true) errors.push("SYNC.enabled should be true when API_CONFIG.base is set");

  /* (a) a local change is PUT to D1 ------------------------------------- */
  DB.add("db_people", "employees", { id: "EMP-7777", name: "Cloud Test", pos: "QA", div: "Admin", team: "—", state: "present", in: "08:00", attend: 100, ot: 0, leaveBal: 9, since: "Jun 2026" });
  await drain();
  if (!server.db_people) errors.push("(a) db_people was not PUT to D1");
  else if (!(server.db_people.tables.employees || []).some(r => r.id === "EMP-7777")) errors.push("(a) pushed row EMP-7777 missing in D1");
  if (!server.db_audit) errors.push("(a) db_audit not PUT — the push should audit operational stores");
  if (ob().length) errors.push("(a) outbox did not drain: " + ob().join(","));

  /* (b) db_identity is NEVER PUT (custody) ------------------------------ */
  // even if something enqueues it, the client must skip AND the mock would 403 it.
  SYNC.enqueue("db_identity");
  await drain();
  if (server.db_identity) errors.push("(b) custody: db_identity must NEVER be PUT to D1");
  if (Object.keys(server).some(s => s === "db_identity")) errors.push("(b) custody: identity store leaked to the cloud");

  /* (d) NO-ECHO / AUDIT-LOOP guard: a follow-up drain must settle ------- */
  const auditBefore = server.db_audit ? server.db_audit.updated : 0;
  await drain();                        // nothing queued → should be a no-op
  const auditAfter = server.db_audit ? server.db_audit.updated : 0;
  if (auditAfter !== auditBefore) errors.push("(d) audit→dirty loop did not settle (db_audit kept advancing)");
  if (ob().length) errors.push("(d) outbox re-filled on an idle drain (echo loop)");

  /* (c) a strictly-newer remote store is PULLED and hydrates (no echo) -- */
  const local = DB.raw("db_people");
  const v = (DB.localMeta("db_people") || {}).v || 12;   // MUST match SEED_VERSION or LWW pushes instead of pulls
  server.db_people = {
    store: "db_people",
    tables: Object.assign({}, local, { employees: [{ id: "EMP-CLOUD", name: "Renamed In Cloud", pos: "QA", div: "Admin", team: "—", state: "present", in: "08:00", attend: 100, ot: 0, leaveBal: 9, since: "Jun 2026" }] }),
    v: v,
    updated: Date.now() + 5000
  };
  const r = await SYNC.pull();
  if ((r.pulled || []).indexOf("db_people") < 0) errors.push("(c) LWW did not pull the newer remote db_people");
  if (!DB.list("db_people", "employees").some(e => e.name === "Renamed In Cloud")) errors.push("(c) hydrate did not land the cloud copy");
  if (ob().indexOf("db_people") >= 0) errors.push("(c) pull echoed db_people back into the outbox");
  // confirm the just-hydrated store is NOT re-PUT by a follow-up drain (no echo back to D1)
  const updBefore = server.db_people.updated;
  await drain();
  if (server.db_people.updated !== updBefore) errors.push("(c) pull echoed back to D1 (store re-PUT after hydrate)");

  console.log(errors.length ? ("FAIL\n- " + errors.join("\n- ")) : "SYNC ROUND-TRIP: ALL CHECKS PASS");
  console.log("non-identity stores (from CATALOG):", NON_IDENTITY, "| stores in D1:", Object.keys(server).length);
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR", e); process.exit(1); });
