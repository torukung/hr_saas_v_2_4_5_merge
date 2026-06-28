// radius.js — RADIUS Access-Request over RadSec (RADIUS/TLS, RFC 6614) via connect() (B4).
//
// "May trail" per the blueprint — real-shaped and self-contained, harden against your
// NPS/FreeRADIUS. Workers can open outbound TCP (RadSec = TLS/2083) but NOT UDP, so classic
// UDP/1812 RADIUS goes through a site agent instead. Packet building lives in
// ./radius-packet.js (unit-tested; md5 injected here from hash-wasm).

import { connect } from "cloudflare:sockets";
import { md5 } from "hash-wasm";
import { buildAccessRequest, parseRadiusCode } from "./radius-packet.js";

const hexToBytes = (h) => Uint8Array.from(h.match(/.{2}/g).map((x) => parseInt(x, 16)));
const md5fn = async (bytes) => hexToBytes(await md5(bytes));

function parseHostPort(host, defPort) {
  const clean = String(host).replace(/^[a-z]+:\/\//i, "");
  const [h, p] = clean.split(":");
  return { host: h, port: p ? Number(p) : defPort };
}

export async function radiusAccessRequest(provider, username, password, secret, { timeoutMs = 6000 } = {}) {
  const { host, port } = parseHostPort(provider.host, 2083);
  const socket = connect({ hostname: host, port }, { secureTransport: "on", allowHalfOpen: false }); // RadSec = TLS
  await socket.opened;
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  try {
    const { packet } = await buildAccessRequest(username, password, secret, md5fn);
    await writer.write(packet);
    const resp = await readPacket(reader, timeoutMs);
    return { ok: parseRadiusCode(resp) === 2, code: parseRadiusCode(resp) }; // 2 = Access-Accept
  } finally {
    try { await writer.close(); } catch (e) { /* noop */ }
    try { await socket.close(); } catch (e) { /* noop */ }
  }
}

// RADIUS length is bytes 2..3 (big-endian) — read until we have that many.
async function readPacket(reader, timeoutMs) {
  let buf = new Uint8Array(0);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (buf.length >= 4) { const total = (buf[2] << 8) | buf[3]; if (buf.length >= total) return buf.subarray(0, total); }
    if (Date.now() > deadline) throw new Error("RADIUS: read timeout");
    const { value, done } = await reader.read();
    if (done) throw new Error("RADIUS: socket closed before a full response");
    const next = new Uint8Array(buf.length + value.length);
    next.set(buf); next.set(value, buf.length);
    buf = next;
  }
}
