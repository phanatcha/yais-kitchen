// Makes the first admin, who can then make every other staff account in the
// app. Run it once per database:
//   npm run create-admin -w @yais-kitchen/auth -- admin@example.com "Admin name"
// If the email already has an account, it becomes an admin.
import { loadConfig } from "@yais-kitchen/shared";
import mongoose from "mongoose";
import { createStore } from "../src/store.js";

const [rawEmail, rawName] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();
const name = rawName?.trim() || email?.split("@")[0];
if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) {
  console.error(
    'Usage: npm run create-admin -w @yais-kitchen/auth -- <email> ["Name"]',
  );
  process.exit(1);
}

const config = loadConfig({ MONGO_URL: { type: "url" } });
const connection = await mongoose
  .createConnection(config.MONGO_URL, {
    dbName: "auth",
    serverSelectionTimeoutMS: 5000,
  })
  .asPromise();

try {
  const store = createStore(connection);
  await store.init();
  const before = await store.User.findOne({ email }).lean();
  await store.User.updateOne(
    { email },
    {
      $set: { role: "admin" },
      $unset: { yaiId: "" },
      $setOnInsert: { email, name: name.slice(0, 80), createdAt: new Date() },
    },
    { upsert: true },
  );
  console.log(
    before
      ? `${email} was ${before.role === "admin" ? "already an admin" : `a ${before.role}, and is now an admin`}.`
      : `Made an admin account for ${email}. Sign in with a code.`,
  );
} finally {
  await connection.close();
}
