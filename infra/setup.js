// Makes .env from .env.example, then fills in the secrets that are blank:
// auth's key pair and the internal token. A value that is already set is
// never changed, so this is safe to run again. Run with `npm run setup`.
import { createPublicKey, generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const envFile = new URL("../.env", import.meta.url);
const exampleFile = new URL("../.env.example", import.meta.url);

const isNew = !existsSync(envFile);
let text = readFileSync(isNew ? exampleFile : envFile, "utf8");

const line = (name) => new RegExp(`^${name}=(.*)$`, "m");
const valueOf = (name) => line(name).exec(text)?.[1].trim() ?? "";
const filled = [];
function set(name, value) {
  if (line(name).test(text))
    text = text.replace(line(name), `${name}=${value}`);
  else text = `${text.trimEnd()}\n${name}=${value}\n`;
  filled.push(name);
}

// .env keeps each key on one line, with \n for the line breaks.
const oneLine = (pem) => pem.trim().replaceAll("\n", "\\n");
const toPem = (value) => value.replaceAll("\\n", "\n");
const publicPem = (key) => key.export({ type: "spki", format: "pem" });

const privateKey = valueOf("AUTH_PRIVATE_KEY");
const publicKey = valueOf("AUTH_PUBLIC_KEY");
if (!privateKey && !publicKey) {
  const pair = generateKeyPairSync("ed25519");
  set(
    "AUTH_PRIVATE_KEY",
    oneLine(pair.privateKey.export({ type: "pkcs8", format: "pem" })),
  );
  set("AUTH_PUBLIC_KEY", oneLine(publicPem(pair.publicKey)));
} else if (privateKey && !publicKey) {
  set(
    "AUTH_PUBLIC_KEY",
    oneLine(publicPem(createPublicKey(toPem(privateKey)))),
  );
} else if (!privateKey) {
  console.warn(
    "AUTH_PUBLIC_KEY is set but AUTH_PRIVATE_KEY is blank. Auth can't sign in" +
      " anyone without it. Clear both and run this again for a new pair.",
  );
}

if (!valueOf("INTERNAL_TOKEN")) {
  set("INTERNAL_TOKEN", randomBytes(32).toString("hex"));
}

writeFileSync(envFile, text, { mode: 0o600 });
if (isNew) console.log("Made .env from .env.example.");
console.log(
  filled.length
    ? `Filled in ${filled.join(", ")}.`
    : "Every secret was already set. Nothing changed.",
);
