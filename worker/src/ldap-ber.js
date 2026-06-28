// ldap-ber.js — dependency-free LDAPv3 BER for a simple bind (no sockets, no deps).
// Split out from ldap.js so it is unit-testable in plain node (see test/contract-test.mjs).

const enc = new TextEncoder();

function len(n) {
  if (n < 0x80) return [n];
  const out = [];
  while (n > 0) { out.unshift(n & 0xff); n >>= 8; }
  return [0x80 | out.length, ...out];
}
function tlv(tag, content) { return Uint8Array.from([tag, ...len(content.length), ...content]); }
const int = (n) => tlv(0x02, [n]);                  // small INTEGER (version, msgid)
const str = (s) => tlv(0x04, [...enc.encode(s)]);   // OCTET STRING

// LDAPMessage { messageID, BindRequest{ version=3, name, simple password } }
export function buildBindRequest(messageID, bindName, password) {
  const bindReq = tlv(0x60, [...int(3), ...str(bindName), ...tlv(0x80, [...enc.encode(password)])]); // [APPLICATION 0]
  return tlv(0x30, [...int(messageID), ...bindReq]);
}

function skipLen(bytes, i) {
  let b = bytes[i++];
  if (b < 0x80) return { next: i, len: b };
  const n = b & 0x7f; let L = 0;
  for (let k = 0; k < n; k++) L = (L << 8) | bytes[i++];
  return { next: i, len: L };
}

// BindResponse → resultCode (0 success · 49 invalidCredentials · …)
export function parseBindResultCode(bytes) {
  let i = 0;
  if (bytes[i++] !== 0x30) throw new Error("LDAP: expected SEQUENCE");
  i = skipLen(bytes, i).next;
  if (bytes[i++] !== 0x02) throw new Error("LDAP: expected messageID");
  { const L = skipLen(bytes, i); i = L.next + L.len; }
  if (bytes[i++] !== 0x61) throw new Error("LDAP: expected BindResponse [APPLICATION 1]");
  i = skipLen(bytes, i).next;
  if (bytes[i++] !== 0x0a) throw new Error("LDAP: expected resultCode ENUMERATED");
  { const L = skipLen(bytes, i); i = L.next; return bytes[i]; }
}

// total byte length once the outer TLV is fully buffered, else 0 (for streaming reads)
export function tlvComplete(b) {
  if (b.length < 2) return 0;
  const first = b[1];
  let contentLen, headerLen;
  if (first < 0x80) { contentLen = first; headerLen = 2; }
  else {
    const n = first & 0x7f;
    if (b.length < 2 + n) return 0;
    contentLen = 0;
    for (let k = 0; k < n; k++) contentLen = (contentLen << 8) | b[2 + k];
    headerLen = 2 + n;
  }
  return b.length >= headerLen + contentLen ? headerLen + contentLen : 0;
}

// build a minimal BindResponse (used by tests + handy for mocks)
// LDAPMessage { messageID, BindResponse[APPLICATION 1]{ resultCode, matchedDN, diagnosticMessage } }
export function buildBindResponse(messageID, resultCode) {
  const resp = tlv(0x61, [...tlv(0x0a, [resultCode]), ...str(""), ...str("")]);
  return tlv(0x30, [...int(messageID), ...resp]);
}
