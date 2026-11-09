// Helpers for tests only. Never import this from service code.
import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import { TOKEN } from "./auth.js";

/**
 * Makes a throwaway key pair, so tests can sign tokens the way auth does.
 * Give `publicKeyPem` to createTokenVerifier, and sign tokens with `signToken`.
 */
export async function createTestKeys() {
  const { publicKey, privateKey } = await generateKeyPair(TOKEN.algorithm, {
    crv: "Ed25519",
    extractable: true,
  });

  /**
   * @param {{ sub?: string, role?: string, expiresIn?: string | number, issuer?: string, audience?: string, [claim: string]: unknown }} [claims]
   */
  function signToken({
    sub = "6650a1f2c3d4e5f6a7b8c9d0",
    role = "tourist",
    expiresIn = "15m",
    issuer = TOKEN.issuer,
    audience = TOKEN.audience,
    ...claims
  } = {}) {
    return new SignJWT({ role, ...claims })
      .setProtectedHeader({ alg: TOKEN.algorithm })
      .setSubject(sub)
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(privateKey);
  }

  return { publicKeyPem: await exportSPKI(publicKey), signToken };
}
