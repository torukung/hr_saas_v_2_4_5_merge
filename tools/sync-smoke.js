/* Sync smoke test — runs js/turso-sync.js against an in-memory mock of the
   libsql v2/pipeline endpoint and verifies the hybrid sync contract:
   first push (10 stores), write→push, LWW pull+hydrate (no echo),
   offline queueing + drain on reconnect.
   Run: node tools/sync-smoke.js .          (no network, no real Turso) */
const fs = require("fs"), path = require("path");
const ROOT = process.argv[2] || ".";
global.window = global;
const code = f => fs.readFileSync(path.join(ROOT, f), "utf8");
eval(code("js/db.js"));

const cloud = { meta: {}, tables: {} };
global.localStorage = { _m: {}, getItem(k) { return k in this._m ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
global.document = undefined; global.navigator = { onLine: true };
global.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  const results = body.requests.filter(r => r.type === "execute").map(req => {
    const sql = req.stmt.sql, args = (req.stmt.args || []).map(a => a.value);
    let m;
    if (/^CREATE TABLE IF NOT EXISTS (\w+)/.test(sql)) { const t = sql.match(/EXISTS (\w+)/)[1]; if (t !== "sync_meta") cloud.tables[t] = cloud.tables[t] || []; }
    else if ((m = sql.match(/^DELETE FROM (\w+)/))) cloud.tables[m[1]] = [];
    else if ((m = sql.match(/^INSERT INTO (\w+) \(pos, pk, json\)/))) { for (let i = 0; i < args.length; i += 3) cloud.tables[m[1]].push({ pos: Number(args[i]), pk: args[i + 1], json: args[i + 2] }); }
    else if (/^INSERT INTO sync_meta/.test(sql)) cloud.meta[args[0]] = { updated_at: Number(args[1]), seed_v: Number(args[2]), device: args[3] };
    else if (/^SELECT store, updated_at, seed_v FROM sync_meta/.test(sql)) return { rows: Object.entries(cloud.meta).map(([s, v]) => [{ value: s }, { value: String(v.updated_at) }, { value: String(v.seed_v) }]), cols: [] };
    else if ((m = sql.match(/^SELECT json FROM (\w+) ORDER BY pos/))) return { rows: (cloud.tables[m[1]] || []).sort((a, b) => a.pos - b.pos).map(r => [{ value: r.json }]), cols: [] };
    return { rows: [], cols: [] };
  });
  return { ok: true, json: async () => ({ results: results.map(r => ({ type: "ok", response: { type: "execute", result: r } })) }) };
};
window.TURSO_CONFIG = { url: "libsql://mock.turso.io", token: "t" };
eval(code("js/turso-sync.js"));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ob = () => JSON.parse(localStorage.getItem("adeptio.v241.turso.outbox") || "[]");
async function drain() { for (let i = 0; i < 60 && ob().length; i++) { await TURSO.flush(); await sleep(25); } }

(async () => {
  const errors = [];
  await TURSO.pull(); await drain();
  if (Object.keys(cloud.meta).length !== 12) errors.push("expected 12 stores in sync_meta (v2.4.3 adds db_overtime; db_identity still excluded by the custody flip), got " + Object.keys(cloud.meta).length);
  // v2.4.1 custody flip — db_identity is server-authoritative; it must NEVER ride the browser token
  if (cloud.meta.db_identity) errors.push("custody: db_identity must NOT push to the cloud (server-authoritative)");
  if ((cloud.tables.identity_accounts || []).length) errors.push("custody: identity accounts leaked to the cloud");
  const empCount = DB.list("db_people", "employees").length;
  if ((cloud.tables.people_employees || []).length !== empCount) errors.push("people_employees mismatch: cloud " + (cloud.tables.people_employees || []).length + " vs local " + empCount);

  DB.add("db_people", "employees", { id: "EMP-7777", name: "Cloud Test", pos: "QA", div: "Admin", team: "—", state: "present", in: "08:00", attend: 100, ot: 0, leaveBal: 9, since: "Jun 2026" });
  await drain();
  if (!cloud.tables.people_employees.some(r => r.pk === "EMP-7777")) errors.push("pushed row missing in cloud");
  if (!cloud.tables.audit_events.length) errors.push("audit events not in cloud");
  if (ob().length) errors.push("outbox did not drain: " + ob().join(","));

  const fresh = JSON.parse(cloud.tables.people_employees[0].json); fresh.name = "Renamed In Cloud";
  cloud.tables.people_employees[0].json = JSON.stringify(fresh);
  cloud.meta.db_people.updated_at = Date.now() + 5000;
  const r3 = await TURSO.pull();
  if (r3.pulled.indexOf("db_people") < 0) errors.push("LWW did not pull newer remote store");
  if (!DB.list("db_people", "employees").some(e => e.name === "Renamed In Cloud")) errors.push("hydrate did not land");
  if (ob().indexOf("db_people") >= 0) errors.push("pull echoed back into outbox");

  navigator.onLine = false;
  DB.add("db_people", "employees", { id: "EMP-8888", name: "Offline Test", pos: "QA", div: "Admin", team: "—", state: "present", in: "08:01", attend: 100, ot: 0, leaveBal: 9, since: "Jun 2026" });
  await TURSO.flush(); await sleep(30);
  if (cloud.tables.people_employees.some(r => r.pk === "EMP-8888")) errors.push("offline write leaked to cloud");
  if (ob().indexOf("db_people") < 0) errors.push("offline write not queued");
  navigator.onLine = true; await drain();
  if (!cloud.tables.people_employees.some(r => r.pk === "EMP-8888")) errors.push("queued write did not drain after reconnect");

  console.log(errors.length ? ("FAIL\n- " + errors.join("\n- ")) : "SYNC ROUND-TRIP: ALL CHECKS PASS");
  console.log("cloud tables:", Object.keys(cloud.tables).length, "| stores in sync_meta:", Object.keys(cloud.meta).length);
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR", e); process.exit(1); });
