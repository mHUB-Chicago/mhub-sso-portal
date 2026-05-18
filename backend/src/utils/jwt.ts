const bufferToHex = (buffer: ArrayBuffer) => {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
}

const hexToBuffer = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

const base64UrlToBase64 = (base64Url: string): string => {
  return base64Url.replace(/-/g, "+").replace(/_/g, "/").padEnd(base64Url.length + (4 - base64Url.length % 4) % 4, "=");
}

const base64UrlToUint8Array = (base64Url: string): Uint8Array => {
  const base64 = base64UrlToBase64(base64Url);
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

const bufferToBase64Url = (buffer: ArrayBuffer) => {
  return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(buffer))))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
}

const sign = async (data: string, secret: string) => {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
  )

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data))
  return bufferToBase64Url(signature)
}

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

export const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    HASH_BYTES * 8
  );
  const saltHex = bufferToHex(salt.buffer);
  const hashHex = bufferToHex(hashBuffer);
  return `pbkdf2:${PBKDF2_ITERATIONS}:${saltHex}:${hashHex}`;
};

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  if (stored.startsWith("pbkdf2:")) {
    const parts = stored.split(":");
    if (parts.length !== 4) return false;
    const iterations = parseInt(parts[1], 10);
    const salt = hexToBuffer(parts[2]);
    const expectedHex = parts[3];
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const hashBuffer = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      keyMaterial,
      HASH_BYTES * 8
    );
    return timingSafeEqual(bufferToHex(hashBuffer), expectedHex);
  }
  // Legacy SHA-256 (backward compat for existing hashes in DB)
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return timingSafeEqual(bufferToHex(hash), stored);
};

export const verifyToken = async (token: string, secret: string): Promise<boolean> => {
  const [headerB64, payloadB64, signatureB64] = token.split(".")
  const payload = JSON.parse(atob(payloadB64));
  const now = Math.floor(Date.now() / 1000);
  const expiration = Number(payload.exp) ?? 0;
  if (expiration < now) {
    return false;
  }
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
  )

  const data = `${headerB64}.${payloadB64}`
  const signature = base64UrlToUint8Array(signatureB64);

  const isValidSignature = await crypto.subtle.verify("HMAC", key, signature, encoder.encode(data))
  return isValidSignature;
}

export const generateAuthToken = async (payload: any, secret: string, expirationMs: number): Promise<string> => {
  const header = {
    alg: "HS256",
    typ: "JWT"
  }

  const expireAt = new Date();
  expireAt.setTime(expireAt.getTime() + expirationMs);
  const expiry = Math.floor(expireAt.getTime() / 1000);
  payload = {...payload, exp: expiry};

  const base64UrlEncode = (obj: any) => {
    return btoa(JSON.stringify(obj))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
  }
  const encodedHeader = base64UrlEncode(header)
  const encodedPayload = base64UrlEncode(payload)

  const token = `${encodedHeader}.${encodedPayload}`
  const signature = await sign(token, secret)

  return `${token}.${signature}`
}
