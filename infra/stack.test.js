// Checks the whole stack from the outside, the way the web app uses it: every
// call goes through the gateway, and the sign-in code is read from Mailpit.
// Runs only when GATEWAY_URL and MAILPIT_URL are set:
//
//   npm run up
//   GATEWAY_URL=http://127.0.0.1:8080 MAILPIT_URL=http://127.0.0.1:8025 \
//     npx vitest run infra
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const { GATEWAY_URL, MAILPIT_URL } = process.env;

async function call(
  path,
  { token, body, method = body ? "POST" : "GET" } = {},
) {
  const response = await fetch(new URL(path, GATEWAY_URL), {
    method,
    headers: {
      ...(body && { "content-type": "application/json" }),
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: body && JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : null,
  };
}

/** The 6-digit code in the newest email Mailpit caught for this address. */
async function codeSentTo(email) {
  const query = encodeURIComponent(`to:"${email}"`);
  let id;
  await expect
    .poll(
      async () => {
        const found = await fetch(
          new URL(`/api/v1/search?query=${query}`, MAILPIT_URL),
        ).then((r) => r.json());
        id = found.messages[0]?.ID;
        return id;
      },
      { timeout: 15_000 },
    )
    .toBeTruthy();
  const message = await fetch(new URL(`/api/v1/message/${id}`, MAILPIT_URL));
  const { Text } = await message.json();
  return /\b(\d{6})\b/.exec(Text)[1];
}

describe.skipIf(!GATEWAY_URL || !MAILPIT_URL)(
  "the stack, through the gateway",
  { timeout: 30_000 },
  () => {
    it("is ready", async () => {
      expect((await call("/ready")).status).toBe(200);
    });

    it("signs in with a code sent by email", async () => {
      const email = `stack-${randomUUID().slice(0, 8)}@example.com`;

      // Gateway → auth, which saves the code and sends an event. RabbitMQ
      // gives it to notification, which emails it to Mailpit.
      const asked = await call("/api/auth/codes", { body: { email } });
      expect(asked.status).toBe(202);
      const code = await codeSentTo(email);

      const signedIn = await call("/api/auth/sessions", {
        body: { email, code },
      });
      expect(signedIn.status).toBe(200);
      expect(signedIn.headers.get("set-cookie")).toMatch(/^yk_refresh=/);

      const me = await call("/api/auth/me", {
        token: signedIn.body.accessToken,
      });
      expect(me.status).toBe(200);
      expect(me.body).toMatchObject({ email, role: "tourist" });

      // A code works only once.
      const again = await call("/api/auth/sessions", { body: { email, code } });
      expect(again.status).toBe(401);
    });

    it("lists Yais from catalog to anyone", async () => {
      const yais = await call("/api/catalog/yais");
      expect(yais.status).toBe(200);
      expect(Array.isArray(yais.body.items)).toBe(true);
    });

    it("answers from the mock for services that aren't built yet", async () => {
      const times = await call(
        "/api/booking/class-times?classId=6650a1f2c3d4e5f6a7b8c9d0",
      );
      expect(times.status).toBe(200);
      expect(Array.isArray(times.body.items)).toBe(true);
    });

    it("never lets internal paths out", async () => {
      const inside = await call(
        "/api/internal/catalog/class-times/6650a1f2c3d4e5f6a7b8c9d0",
      );
      expect(inside.status).toBe(404);
    });
  },
);
