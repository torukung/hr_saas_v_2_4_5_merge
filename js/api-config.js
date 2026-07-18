/* ============================================================
   ADEPTIO · v2.4.5 Merged — Worker API configuration
   ONE deployed Cloudflare Worker (adeptio-hr-v245) serves BOTH:
     · edge auth   — flipping auth_mode to "remote" routes sign-in
       through the edge (real LDAPS/RadSec bind + Argon2id, httpOnly
       sessions), and
     · D1 sync     — js/d1-sync.js replicates every operational store
       to Cloudflare D1 (GET/PUT /api/sync[/:store]).
   Set base to the deployed Worker URL (e.g.
   "https://adeptio-hr-v245.<your-subdomain>.workers.dev").
   Leave base EMPTY → the app stays LOCAL-ONLY: the in-browser
   directory simulator handles auth and no D1 replication runs
   (offline-safe demo, no network calls). syncSeconds is the D1
   replication interval (default 30).

   The Worker code lives in /worker (deploy with `wrangler deploy`
   or the push Action). It owns the credential hashes — this page
   never sees them. See worker/README.md for the endpoint contract.
   ============================================================ */
window.API_CONFIG = {
  // e.g. "https://adeptio-hr-v245.<your-subdomain>.workers.dev"
  base: "https://adeptio-hr-v245.pathom-bot.workers.dev",
  // D1 replication interval in seconds (js/d1-sync.js); empty base => no sync.
  syncSeconds: 30,
  // Bearer token sent on every /api/sync request — set to the SAME value as the
  // Worker's SYNC_TOKEN secret. Empty => the fail-closed Worker returns 401.
  syncToken: "fa5e25948d21a7dc655ce2e06eb1889406bb3496f488a1b61be5cda6ce04f945",
  // HR mailbox shown on the local "new hire registered" outbox row (display only);
  // the Worker fills the REAL delivery recipient from its HR_ALERT_TO var/secret.
  // Central neutral mailbox — matches the Worker's HR_ALERT_TO / MAIL_FROM.
  hrAlertTo: "info@deskcentral.io"
};
