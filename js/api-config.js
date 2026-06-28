/* ============================================================
   ADEPTIO · v2.4.1.edge.auth — edge Worker (auth API) configuration
   Leave base empty → auth_mode=remote has nowhere to go, so the app
   stays on the in-browser directory simulator (offline-safe demo).
   Set base to the deployed Worker URL → flipping auth_mode to
   "remote" routes sign-in through the edge (real LDAPS/RadSec bind
   + Argon2id, httpOnly sessions, Turso-authoritative).

   The Worker code lives in /worker (deploy with `wrangler deploy`
   or the push Action). It owns the credential hashes — this page
   never sees them. See worker/README.md for the endpoint contract.
   ============================================================ */
window.API_CONFIG = {
  // e.g. "https://adeptio-auth.<your-subdomain>.workers.dev"
  base: ""
};
