/* ============================================================
   ADEPTIO · v2.4.1.edge.auth — Turso cloud-sync configuration
   Leave url/token empty → the app runs exactly as before
   (localStorage only, no network calls, no badge).
   Fill both → js/turso-sync.js goes live: hybrid offline-first,
   localStorage stays the working cache, Turso is the cloud copy.

   v2.4.1 syncs to its OWN database (adeptio-hr-v241, provisioned
   2026-06-14) — deliberately separate from adeptio-hr-v240 (the
   v2.4.0 build) so seed v7 and seed v8 never overwrite each other.

   ⚠ THE CUSTODY FLIP (v2.4.1 · B1): db_identity is now
   SERVER-AUTHORITATIVE. The edge Worker owns account credentials
   (Argon2id) in this same database; the browser therefore NEVER
   pushes or pulls db_identity over this token (see js/turso-sync.js
   custodySkip). Only the operational stores (people, time, leave,
   workflow, payroll, comms, docs, audit, reports, platform) ride
   the browser sync. Sessions, tokens and the directory simulator
   never leave the device in any mode.

   ⚠ Demo trade-off: this token ships to every visitor's browser.
   It is scoped to this one database only, and (per the custody flip)
   cannot read or write credential hashes. For production, move all
   writes behind the edge Worker and drop the browser token entirely.
   ============================================================ */
window.TURSO_CONFIG = {
  url: "https://adeptio-hr-v241-torukung.aws-ap-northeast-1.turso.io",
  token: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3ODEzNzA0NTgsImlkIjoiMDE5ZWMxZjMtZjEwMS03YWZhLThhMDgtY2QwMGNiNzkxN2Y0IiwicmlkIjoiNzBkZjk0YjctYzk1Yi00OGEwLThiNGMtNDMzNzIwM2M0OTM3In0.QHWnt7yethaHSAIXnhJMzMos6r7-DEeU-qHbqcEW4ckfemlc3nqKOaoFmTgKBWtc1QBroSpatk5xXa05bSkNDw"
};
