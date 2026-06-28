// ldap.js — LDAP/AD simple bind over LDAPS via Cloudflare Workers connect() (B3).
//
// Verifies a password by BINDING as the user — the password never leaves the TLS tunnel
// and is never stored. The BER encode/decode lives in ./ldap-ber.js (unit-tested).
//
//   - Active Directory: bind directly with the userPrincipalName (the e-mail) — AD accepts
//     a UPN as the bind name, so no prior search is needed.
//   - Generic LDAP: set provider.userDNTemplate, e.g. "uid={user},ou=people,dc=acme,dc=la"
//     ({user}=local-part, {email}=full address).
//   - A service-account search-then-bind variant is the next step where UPN bind is absent;
//     the socket plumbing below is identical, only the bind name resolution changes.

import { connect } from "cloudflare:sockets";
import { buildBindRequest, parseBindResultCode, tlvComplete } from "./ldap-ber.js";

function parseHostPort(host, defPort) {
  const clean = String(host).replace(/^[a-z]+:\/\//i, "");
  const [h, p] = clean.split(":");
  return { host: h, port: p ? Number(p) : defPort };
}
function bindNameFor(provider, email) {
  if (provider.userDNTemplate) return provider.userDNTemplate.replace("{email}", email).replace("{user}", email.split("@")[0]);
  return email; // AD UPN bind
}

export async function ldapBind(provider, email, password, { timeoutMs = 6000 } = {}) {
  const { host, port } = parseHostPort(provider.host, 636);
  const tls = provider.transport !== "ldap"; // ldaps (default) → TLS on; "ldap" → StartTLS/plain (lab only)
  const socket = connect({ hostname: host, port }, { secureTransport: tls ? "on" : "off", allowHalfOpen: false });
  await socket.opened;
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  try {
    await writer.write(buildBindRequest(1, bindNameFor(provider, email), password));
    const resp = await readOneMessage(reader, timeoutMs);
    const code = parseBindResultCode(resp);
    return { ok: code === 0, code }; // 0 success · 49 invalidCredentials
  } finally {
    try { await writer.close(); } catch (e) { /* noop */ }
    try { await socket.close(); } catch (e) { /* noop */ }
  }
}

async function readOneMessage(reader, timeoutMs) {
  let buf = new Uint8Array(0);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const total = tlvComplete(buf);
    if (total) return buf.subarray(0, total);
    if (Date.now() > deadline) throw new Error("LDAP: read timeout");
    const { value, done } = await reader.read();
    if (done) throw new Error("LDAP: socket closed before a full response");
    const next = new Uint8Array(buf.length + value.length);
    next.set(buf); next.set(value, buf.length);
    buf = next;
  }
}
