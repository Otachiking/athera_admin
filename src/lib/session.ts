/**
 * Token sesi bertanda tangan HMAC-SHA256 (Web Crypto, jalan di proxy maupun server).
 * Format: base64url(payload).base64url(signature)
 */
export const SESSION_COOKIE = "athera_session";
export const SESSION_TTL = 60 * 60 * 24 * 14; // 14 hari

const enc = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET belum diset / terlalu pendek");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function createToken(username: string): Promise<string> {
  const payload = b64urlEncode(
    enc.encode(JSON.stringify({ u: username, exp: Math.floor(Date.now() / 1000) + SESSION_TTL })),
  );
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(payload));
  return `${payload}.${b64urlEncode(new Uint8Array(sig))}`;
}

/** Mengembalikan username jika token valid dan belum kedaluwarsa, selain itu null. */
export async function verifyToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      b64urlDecode(sig) as BufferSource,
      enc.encode(payload),
    );
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as { u: string; exp: number };
    if (!data.u || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data.u;
  } catch {
    return null;
  }
}
