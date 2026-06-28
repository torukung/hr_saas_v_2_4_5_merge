// radius-packet.js — dependency-free RADIUS Access-Request building (no sockets, no deps).
// md5 is INJECTED (async bytes→bytes) so this is unit-testable in node without hash-wasm.

const enc = new TextEncoder();
const attr = (type, valueBytes) => Uint8Array.from([type, valueBytes.length + 2, ...valueBytes]);
const concat = (...arrs) => {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total); let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
};

// RFC 2865 §5.2 PAP: c[i] = p[i] XOR MD5(secret + (i ? prevCipher : RequestAuthenticator))
export async function encryptUserPassword(password, secret, authenticator, md5) {
  const pw = enc.encode(password);
  const padded = new Uint8Array(Math.ceil((pw.length || 1) / 16) * 16);
  padded.set(pw);
  const sec = enc.encode(secret);
  const out = new Uint8Array(padded.length);
  let prev = authenticator;
  for (let i = 0; i < padded.length; i += 16) {
    const b = await md5(concat(sec, prev));
    const c = new Uint8Array(16);
    for (let j = 0; j < 16; j++) c[j] = padded[i + j] ^ b[j];
    out.set(c, i);
    prev = c;
  }
  return out;
}

// Access-Request (code 1). authenticator can be injected for deterministic tests.
export async function buildAccessRequest(username, password, secret, md5, authenticator) {
  const auth = authenticator || crypto.getRandomValues(new Uint8Array(16));
  const userName = attr(1, enc.encode(username));
  const userPassword = attr(2, await encryptUserPassword(password, secret, auth, md5));
  const attrs = concat(userName, userPassword);
  const length = 20 + attrs.length;
  const packet = new Uint8Array(length);
  packet[0] = 1;                                  // Access-Request
  packet[1] = (Math.random() * 256) | 0;          // identifier
  packet[2] = (length >> 8) & 0xff; packet[3] = length & 0xff;
  packet.set(auth, 4);
  packet.set(attrs, 20);
  return { packet, authenticator: auth };
}

export const parseRadiusCode = (bytes) => (bytes && bytes.length ? bytes[0] : 0); // 2=Accept · 3=Reject
