// Signs a token the way auth will, so the web app can call signed-in routes
// through the gateway before the auth service exists. For local use only:
// it reads AUTH_PRIVATE_KEY from your .env.
//
//   npm run token -w @yais-kitchen/gateway -- tourist
//   npm run token -w @yais-kitchen/gateway -- family <yaiId>
import { loadConfig, ROLES, TOKEN } from "@yais-kitchen/shared";
import { importPKCS8, SignJWT } from "jose";

const [role = "tourist", yaiId = "6650a1f2c3d4e5f6a7b8c9d2"] =
  process.argv.slice(2);
if (!ROLES.includes(role)) {
  console.error(`The role must be one of: ${ROLES.join(", ")}`);
  process.exit(1);
}

const config = loadConfig({ AUTH_PRIVATE_KEY: { type: "pem" } });
const key = await importPKCS8(config.AUTH_PRIVATE_KEY, TOKEN.algorithm);

const token = await new SignJWT({
  role,
  email: `${role}@example.com`,
  name: `Sample ${role}`,
  ...(role === "family" && { yaiId }),
})
  .setProtectedHeader({ alg: TOKEN.algorithm })
  .setSubject("6650a1f2c3d4e5f6a7b8c9d0")
  .setIssuer(TOKEN.issuer)
  .setAudience(TOKEN.audience)
  .setIssuedAt()
  .setExpirationTime("8h")
  .sign(key);

console.log(token);
