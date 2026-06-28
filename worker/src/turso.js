// turso.js — the edge Worker's server-authoritative identity store (libSQL HTTP).
//
// v2.4.1.edge.auth · B1 — the custody flip. Credential hashes (Argon2id) live HERE, in
// Turso (adeptio-hr-v241), reachable from the Worker over plain HTTPS (the /v2/pipeline
// API — no socket needed). The browser never receives a hash; it only ever calls the
// auth endpoints and gets a verdict + an httpOnly session cookie.
//
// Tables (own namespace, distinct from the browser sync's identity_* group, so the two
// never collide): accounts · sessions · tokens · audit.
//
// Env: TURSO_URL (e.g. https://adeptio-hr-v241-<org>.turso.io), TURSO_TOKEN (secret).

const ARG = (v) =>
  v === null || v === undefined ? { type: "null", value: null }
  : typeof v === "number" ? { type: Number.isInteger(v) ? "integer" : "float", value: String(v) }
  : typeof v === "boolean" ? { type: "integer", value: v ? "1" : "0" }
  : { type: "text", value: String(v) };

export function makeStore(env) {
  const base = String(env.TURSO_URL || "").replace(/^libsql:\/\//, "https://").replace(/\/+$/, "");
  const token = env.TURSO_TOKEN;
  if (!base || !token) throw new Error("Turso not configured: set TURSO_URL and TURSO_TOKEN.");

  async function pipeline(stmts) {
    const res = await fetch(base + "/v2/pipeline", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: stmts
          .map((s) => ({ type: "execute", stmt: typeof s === "string" ? { sql: s } : s }))
          .concat([{ type: "close" }]),
      }),
    });
    if (!res.ok) throw new Error("Turso HTTP " + res.status);
    const out = await res.json();
    return (out.results || []).map((r) => {
      if (r.type === "error") throw new Error((r.error && r.error.message) || "statement failed");
      return r.response && r.response.result ? r.response.result : null;
    });
  }
  // run one parameterized statement, return rows as plain objects
  async function q(sql, args = []) {
    const [result] = await pipeline([{ sql, args: args.map(ARG) }]);
    if (!result || !result.rows) return [];
    const cols = (result.cols || []).map((c) => c.name);
    return result.rows.map((row) => {
      const o = {};
      row.forEach((cell, i) => (o[cols[i]] = cell && cell.value !== undefined ? cell.value : null));
      return o;
    });
  }
  const run = (sql, args = []) => q(sql, args);

  async function ensureSchema() {
    await pipeline([
      `CREATE TABLE IF NOT EXISTS accounts (email TEXT PRIMARY KEY, name TEXT, emp TEXT, scopes TEXT,
         status TEXT, mode TEXT, secret_hash TEXT, hash_pending_purge INTEGER DEFAULT 0,
         fails INTEGER DEFAULT 0, locked_until INTEGER DEFAULT 0, last_login TEXT, created TEXT, break_glass INTEGER DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, email TEXT, name TEXT, emp TEXT,
         scopes TEXT, started TEXT, seen INTEGER, device TEXT)`,
      `CREATE TABLE IF NOT EXISTS tokens (id TEXT PRIMARY KEY, kind TEXT, email TEXT, created TEXT, expires INTEGER, used INTEGER DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS audit (ts TEXT, who TEXT, act TEXT, obj TEXT, ip TEXT)`,
      // directory providers — NON-SECRET connection config the admin authors in the SPA; the
      // bind secret is NOT here (RADIUS uses the RADIUS_SECRET env secret).
      `CREATE TABLE IF NOT EXISTS providers (id TEXT PRIMARY KEY, type TEXT, host TEXT, transport TEXT, base_dn TEXT, bind_dn TEXT, user_dn_template TEXT, user_attr TEXT, updated TEXT)`,
    ]);
  }

  const rowToAccount = (r) =>
    r ? { ...r, scopes: safeJSON(r.scopes, ["staff"]), fails: +r.fails || 0, locked_until: +r.locked_until || 0, hash_pending_purge: +r.hash_pending_purge ? true : false, break_glass: +r.break_glass ? true : false } : null;

  return {
    pipeline, q, run, ensureSchema,

    // ---- accounts (secret_hash NEVER leaves this module to the client) ----
    async account(email) {
      const rows = await q("SELECT * FROM accounts WHERE email = ?", [String(email).toLowerCase()]);
      return rowToAccount(rows[0]);
    },
    async upsertAccount(a) {
      await run(
        `INSERT INTO accounts (email,name,emp,scopes,status,mode,secret_hash,hash_pending_purge,fails,locked_until,last_login,created,break_glass)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(email) DO UPDATE SET name=excluded.name, emp=excluded.emp, scopes=excluded.scopes,
           status=excluded.status, mode=excluded.mode, secret_hash=excluded.secret_hash,
           hash_pending_purge=excluded.hash_pending_purge, fails=excluded.fails,
           locked_until=excluded.locked_until, last_login=excluded.last_login, break_glass=excluded.break_glass`,
        [a.email.toLowerCase(), a.name || "", a.emp || "", JSON.stringify(a.scopes || ["staff"]), a.status || "active",
         a.mode || "local", a.secret_hash || null, a.hash_pending_purge ? 1 : 0, a.fails || 0, a.locked_until || 0,
         a.last_login || null, a.created || nowStamp(), a.break_glass ? 1 : 0]
      );
    },
    async patchAccount(email, patch) {
      const sets = Object.keys(patch).map((k) => k + " = ?");
      const vals = Object.values(patch).map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v));
      await run("UPDATE accounts SET " + sets.join(", ") + " WHERE email = ?", [...vals, String(email).toLowerCase()]);
    },

    // ---- sessions ----
    async createSession(s) {
      await run("INSERT INTO sessions (id,email,name,emp,scopes,started,seen,device) VALUES (?,?,?,?,?,?,?,?)",
        [s.id, s.email, s.name, s.emp, JSON.stringify(s.scopes || []), s.started, s.seen, s.device || "edge"]);
    },
    async session(id) {
      const rows = await q("SELECT * FROM sessions WHERE id = ?", [id]);
      return rows[0] ? { ...rows[0], scopes: safeJSON(rows[0].scopes, []), seen: +rows[0].seen } : null;
    },
    touchSession: (id, seen) => run("UPDATE sessions SET seen = ? WHERE id = ?", [seen, id]),
    dropSession: (id) => run("DELETE FROM sessions WHERE id = ?", [id]),
    dropSessionsFor: (email) => run("DELETE FROM sessions WHERE email = ?", [String(email).toLowerCase()]),

    // ---- tokens ----
    async createToken(t) {
      await run("UPDATE tokens SET used = 1 WHERE email = ? AND kind = ? AND used = 0", [t.email, t.kind]);
      await run("INSERT INTO tokens (id,kind,email,created,expires,used) VALUES (?,?,?,?,?,0)", [t.id, t.kind, t.email, t.created, t.expires]);
    },
    async token(id) {
      const rows = await q("SELECT * FROM tokens WHERE id = ?", [id]);
      return rows[0] ? { ...rows[0], used: +rows[0].used, expires: +rows[0].expires } : null;
    },
    useToken: (id) => run("UPDATE tokens SET used = 1 WHERE id = ?", [id]),

    // ---- providers (non-secret connection config; the real bind reads these) ----
    async providerByType(type) {
      const rows = await q("SELECT * FROM providers WHERE type = ? ORDER BY updated DESC LIMIT 1", [type]);
      const r = rows[0];
      return r ? { id: r.id, type: r.type, host: r.host, transport: r.transport, baseDN: r.base_dn, bindDN: r.bind_dn, userDNTemplate: r.user_dn_template, userAttr: r.user_attr } : null;
    },
    async upsertProvider(p) {
      await run(
        `INSERT INTO providers (id,type,host,transport,base_dn,bind_dn,user_dn_template,user_attr,updated)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET type=excluded.type, host=excluded.host, transport=excluded.transport,
           base_dn=excluded.base_dn, bind_dn=excluded.bind_dn, user_dn_template=excluded.user_dn_template,
           user_attr=excluded.user_attr, updated=excluded.updated`,
        [p.id, p.type, p.host || "", p.transport || "", p.baseDN || "", p.bindDN || "", p.userDNTemplate || "", p.userAttr || "", nowStamp()]
      );
    },

    // ---- audit ----
    audit: (who, act, obj, ip) => run("INSERT INTO audit (ts,who,act,obj,ip) VALUES (?,?,?,?,?)", [nowStamp(), who, act, obj, ip || "edge"]),
  };
}

function safeJSON(s, fallback) { try { return JSON.parse(s); } catch (e) { return fallback; } }
function nowStamp() { return new Date().toISOString(); }
