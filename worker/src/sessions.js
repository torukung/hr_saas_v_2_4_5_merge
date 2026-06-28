// sessions.js — httpOnly cookie + id helpers for the edge Worker (B1).
//
// The session id lives ONLY in an httpOnly, Secure, SameSite cookie — JavaScript on the
// page can never read it, and the session record itself is server-side in Turso. That is
// the custody win over the v2.4.0 demo (which kept the session id in localStorage).

const COOKIE = "adeptio_sid";
const MAX_AGE = 8 * 3600; // 8 h hard cap; idle timeout is enforced server-side too

export function sessionCookie(id, { clear = false } = {}) {
  const flags = "HttpOnly; Secure; SameSite=None; Path=/";
  return clear
    ? `${COOKIE}=; ${flags}; Max-Age=0`
    : `${COOKIE}=${id}; ${flags}; Max-Age=${MAX_AGE}`;
}

export function readSidCookie(req) {
  const c = req.headers.get("Cookie") || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
  return m ? m[1] : null;
}

export const newSessionId = () =>
  "SES-" + Date.now().toString(36).toUpperCase() + crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();

export const newTokenId = (kind) =>
  "TOK-" + String(kind).toUpperCase() + "-" + Date.now().toString(36).toUpperCase() + crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
