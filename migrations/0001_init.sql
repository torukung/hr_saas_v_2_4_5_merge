-- ============================================================
-- Adeptio v2.4.5 Merged — Cloudflare D1 schema (single-tenant)
-- Mirrors the 15-store split catalog. The browser persists each store as
-- { v, t, tables:{ tableName:[...rows] } }; D1 holds one row per store
-- (store_blob) so the cutover is a faithful 1:1 of the localStorage model.
-- Row-level normalisation can come later in Claude Code — this is the
-- minimal, honest live schema. db_identity is SERVER-AUTHORITATIVE and is
-- never pushed from the browser (sessions/tokens custody).
-- Apply:  wrangler d1 execute adeptio-hr-v245 --file=migrations/0001_init.sql
-- ============================================================

-- one JSON blob per split store ------------------------------------------------
CREATE TABLE IF NOT EXISTS store_blob (
  store    TEXT PRIMARY KEY,             -- db_people, db_ledger, …
  tables   TEXT NOT NULL DEFAULT '{}',   -- JSON: { table: [...rows] }
  v        INTEGER NOT NULL DEFAULT 12,  -- SEED_VERSION
  updated  INTEGER NOT NULL DEFAULT 0,   -- epoch ms (last write)
  sensitive INTEGER NOT NULL DEFAULT 0,  -- 1 = server-authoritative (db_identity)
  derived  INTEGER NOT NULL DEFAULT 0    -- 1 = rebuildable (dw_reports)
);

-- full-split backup sets (also mirrored to R2 dated folders) -------------------
CREATE TABLE IF NOT EXISTS backups (
  id       TEXT PRIMARY KEY,             -- BK-1001
  folder   TEXT,                         -- YYYY-MM-DD  (the "daily folder")
  ts       TEXT,
  kind     TEXT,                         -- daily | manual-force | scheduled | pre-run
  label    TEXT,
  stores   TEXT,                         -- JSON array of store ids
  data     TEXT,                         -- JSON full snapshot (large sets live in R2; key here)
  r2_key   TEXT,                         -- r2://adeptio-hr-backups/<folder>/<id>.json
  rows     INTEGER DEFAULT 0,
  sizekb   INTEGER DEFAULT 0,
  created  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_backups_folder ON backups(folder);

-- sessions (hot copy is in KV; this is the durable mirror) ---------------------
CREATE TABLE IF NOT EXISTS sessions (
  token    TEXT PRIMARY KEY,
  account  TEXT,
  scopes   TEXT,
  created  INTEGER,
  expires  INTEGER
);

-- audit tail -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit (
  id  INTEGER PRIMARY KEY AUTOINCREMENT,
  ts  TEXT, who TEXT, act TEXT, obj TEXT, ip TEXT
);

-- seed the 15 store rows (empty tables; the client's first /api/sync pushes data)
INSERT OR IGNORE INTO store_blob (store, sensitive, derived) VALUES
 ('db_people',0,0), ('db_time',0,0), ('db_leave',0,0), ('db_workflow',0,0),
 ('db_payroll',0,0), ('db_comms',0,0), ('db_docs',0,0), ('db_audit',0,0),
 ('dw_reports',0,1), ('db_platform',0,0), ('db_identity',1,0), ('db_devices',0,0),
 ('db_overtime',0,0), ('db_schedule',0,0), ('db_ledger',0,0);
