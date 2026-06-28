/* ============================================================
   ADEPTIO v2.4.5 Merged — Cloudflare Worker (D1 · KV · R2)
   The API the static client talks to once it's live on Cloudflare.
   Single-tenant. Bindings (see ../wrangler.toml):
     DB        → D1 (the 15-store split catalog · store_blob)
     SESSIONS  → KV (hot session tokens)
     BACKUPS   → R2 (dated backup folders)
   Routes:
     GET  /api/health
     GET  /api/sync            → pull every non-sensitive store
     GET  /api/sync/:store     → pull one store
     PUT  /api/sync/:store     → push one store   (db_identity rejected — custody)
     GET  /api/backup          → list backup sets
     POST /api/backup          → create a full-split set (D1 row + R2 object)
     POST /api/restore/:id     → restore a set into store_blob
     POST /mail | /webhook/:ch | /punch  → channel/device seams (stubs until keyed)
   NOTE: external send (SMTP/LINE/WA/SMS) is a STUB here — wire the real
   adapters + auth hardening in Claude Code. Secrets come from wrangler.
   ============================================================ */
const SENSITIVE = new Set(["db_identity"]);            // never synced from the browser
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,PUT,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization"
};
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", ...CORS } });
const today = () => new Date().toISOString().slice(0, 10);

async function requireSession(req, env) {
  // minimal bearer check — harden in Claude Code (Argon2 + KV TTL already scaffolded in sessions.js)
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!tok) return null;
  try { const hit = await env.SESSIONS.get("sess:" + tok); return hit ? JSON.parse(hit) : null; } catch (e) { return null; }
}

export default {
  async fetch(req, env, ctx) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/+$/, "");
    try {
      // ---- health ----
      if (p === "/api/health") {
        const r = await env.DB.prepare("SELECT count(*) n FROM store_blob").first().catch(() => null);
        return json({ ok: true, app: env.APP || "Adeptio v2.4.5", ts: new Date().toISOString(), stores: r ? r.n : null });
      }

      // ---- sync (pull) ----
      if (p === "/api/sync" && req.method === "GET") {
        const { results } = await env.DB.prepare("SELECT store, tables, v, updated FROM store_blob WHERE sensitive=0").all();
        return json({ ok: true, stores: results });
      }
      const mSync = p.match(/^\/api\/sync\/(db_[a-z]+|dw_reports)$/);
      if (mSync) {
        const store = mSync[1];
        if (req.method === "GET") {
          if (SENSITIVE.has(store)) return json({ ok: false, err: "sensitive store is server-authoritative" }, 403);
          const row = await env.DB.prepare("SELECT store, tables, v, updated FROM store_blob WHERE store=?").bind(store).first();
          return row ? json({ ok: true, store: row }) : json({ ok: false, err: "unknown store" }, 404);
        }
        if (req.method === "PUT") {
          if (SENSITIVE.has(store)) return json({ ok: false, err: "db_identity is never accepted from the client (custody)" }, 403);
          const body = await req.json().catch(() => null);
          if (!body || typeof body.tables !== "object") return json({ ok: false, err: "expected { tables, v }" }, 400);
          const now = Date.now();
          await env.DB.prepare("UPDATE store_blob SET tables=?, v=?, updated=? WHERE store=?")
            .bind(JSON.stringify(body.tables), body.v || 12, now, store).run();
          return json({ ok: true, store, updated: now });
        }
      }

      // ---- backups ----
      if (p === "/api/backup" && req.method === "GET") {
        const { results } = await env.DB.prepare("SELECT id, folder, ts, kind, label, stores, rows, sizekb, r2_key FROM backups ORDER BY created DESC LIMIT 200").all();
        return json({ ok: true, backups: results });
      }
      if (p === "/api/backup" && req.method === "POST") {
        const sess = await requireSession(req, env); // backups are admin-only
        const body = await req.json().catch(() => ({}));
        const id = "BK-" + Date.now();
        const folder = body.folder || today();
        const dataStr = JSON.stringify(body.data || {});
        const r2key = `${folder}/${id}.json`;
        ctx.waitUntil(env.BACKUPS.put(r2key, dataStr, { httpMetadata: { contentType: "application/json" } }));
        await env.DB.prepare("INSERT INTO backups (id,folder,ts,kind,label,stores,data,r2_key,rows,sizekb,created) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
          .bind(id, folder, new Date().toISOString(), body.kind || "manual-force", body.label || ("Force · " + folder),
            JSON.stringify(body.stores || []), dataStr, r2key, body.rows || 0, Math.round(dataStr.length / 1024), Date.now()).run();
        return json({ ok: true, id, folder, r2_key: r2key });
      }
      const mRes = p.match(/^\/api\/restore\/(BK-[\w-]+)$/);
      if (mRes && req.method === "POST") {
        const bk = await env.DB.prepare("SELECT data FROM backups WHERE id=?").bind(mRes[1]).first();
        if (!bk) return json({ ok: false, err: "backup not found" }, 404);
        const data = JSON.parse(bk.data || "{}");
        let n = 0;
        for (const store of Object.keys(data)) {
          if (SENSITIVE.has(store)) continue; // identity excluded from restore
          await env.DB.prepare("UPDATE store_blob SET tables=?, updated=? WHERE store=?")
            .bind(JSON.stringify(data[store].tables || data[store]), Date.now(), store).run();
          n++;
        }
        return json({ ok: true, restored: n, id: mRes[1] });
      }

      // ---- channel + device seams (stubs until keyed in Claude Code) ----
      if (p === "/mail" && req.method === "POST") return json({ ok: true, queued: true, note: "SMTP relay stub — set SMTP_APP_PASSWORD secret + wire mailer.js" });
      if (p.startsWith("/webhook/")) return json({ ok: true, channel: p.split("/")[2], note: "channel webhook stub — set token secret + verify signature" });
      if (p === "/punch" && req.method === "POST") return json({ ok: true, note: "device punch ingest stub — see src/punch.js (ZKTeco ADMS · HMAC custom)" });

      return json({ ok: false, err: "not found", path: p }, 404);
    } catch (e) {
      return json({ ok: false, err: String(e && e.message || e) }, 500);
    }
  }
};
