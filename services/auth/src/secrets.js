import {
  createHash,
  createHmac,
  createPublicKey,
  hkdfSync,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { TOKEN } from "@yais-kitchen/shared";
import { importPKCS8, SignJWT } from "jose";

export const ACCESS_SECONDS = 15 * 60;
export const GUEST_SECONDS = 30 * 60;

/** Auth's public key, worked out from the private one so the two always match. */
export const publicKeyOf = (privateKeyPem) =>
  createPublicKey(privateKeyPem).export({ type: "spki", format: "pem" });

/**
 * Signs access tokens and guest tokens with auth's Ed25519 private key.
 * @param {string} privateKeyPem
 */
export async function createTokenSigner(privateKeyPem) {
  const key = await importPKCS8(privateKeyPem, TOKEN.algorithm);
  const sign = (subject, claims, seconds) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: TOKEN.algorithm })
      .setSubject(subject)
      .setIssuer(TOKEN.issuer)
      .setAudience(TOKEN.audience)
      .setIssuedAt()
      .setExpirationTime(`${seconds}s`)
      .sign(key);

  return {
    /** 15 minutes, for a signed-in person. */
    access: (user) =>
      sign(
        user.id,
        {
          role: user.role,
          email: user.email,
          name: user.name,
          ...(user.yaiId && { yaiId: user.yaiId }),
        },
        ACCESS_SECONDS,
      ),
    /** 30 minutes, for one guest checkout. `sid` ties bookings to it. */
    guest: (user) =>
      sign(
        user.id,
        {
          role: "guest",
          email: user.email,
          name: user.name,
          sid: randomUUID(),
        },
        GUEST_SECONDS,
      ),
  };
}

/** A 6-digit code, every value equally likely. */
export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/**
 * Hashes sign-in codes with a key only auth has. A plain hash of a 6-digit
 * code could be reversed by trying all million codes, so a copy of the
 * database alone must not be enough. The key comes from the private key,
 * labelled for this one use.
 * @param {string} secret
 */
export function createCodeHasher(secret) {
  const key = Buffer.from(
    hkdfSync("sha256", secret, "", "yais-kitchen sign-in codes", 32),
  );
  const hash = (email, code) =>
    createHmac("sha256", key).update(`${email}\n${code}`).digest("base64url");

  return {
    hash,
    matches(email, code, stored) {
      const given = Buffer.from(hash(email, code));
      const expected = Buffer.from(stored);
      return (
        given.length === expected.length && timingSafeEqual(given, expected)
      );
    },
  };
}

/** A refresh token: 32 random bytes. Only its hash is stored. */
export const newRefreshToken = () => randomBytes(32).toString("base64url");

export const hashToken = (token) =>
  createHash("sha256").update(token).digest("base64url");
