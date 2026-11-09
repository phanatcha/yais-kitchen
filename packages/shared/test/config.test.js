import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.js";

const PEM =
  "-----BEGIN PUBLIC KEY-----\\nMCowBQYDK2VwAyEA\\n-----END PUBLIC KEY-----";

describe("loadConfig", () => {
  it("reads and converts each variable", () => {
    const config = loadConfig(
      {
        PORT: { type: "port" },
        MONGO_URL: { type: "url" },
        MAX_GUESTS: { type: "integer" },
        AUTH_PUBLIC_KEY: { type: "pem" },
        NAME: {},
      },
      {
        PORT: "3001",
        MONGO_URL: "mongodb://localhost:27017",
        MAX_GUESTS: "6",
        AUTH_PUBLIC_KEY: PEM,
        NAME: " catalog ",
      },
    );

    expect(config).toEqual({
      PORT: 3001,
      MONGO_URL: "mongodb://localhost:27017",
      MAX_GUESTS: 6,
      AUTH_PUBLIC_KEY:
        "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA\n-----END PUBLIC KEY-----",
      NAME: "catalog",
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it("uses defaults and allows optional variables", () => {
    const config = loadConfig(
      { PORT: { type: "port", default: 3000 }, SMTP_USER: { optional: true } },
      {},
    );
    expect(config).toEqual({ PORT: 3000, SMTP_USER: undefined });
  });

  it("lists every missing or wrong variable at once, without their values", () => {
    const load = () =>
      loadConfig(
        {
          MONGO_URL: { type: "url" },
          RABBITMQ_URL: { type: "url" },
          PORT: { type: "port" },
          INTERNAL_TOKEN: {},
          AUTH_PUBLIC_KEY: { type: "pem" },
        },
        {
          RABBITMQ_URL: "not a url secret-password",
          PORT: "99999",
          INTERNAL_TOKEN: "   ",
          AUTH_PUBLIC_KEY: "nope",
        },
      );

    expect(load).toThrow(ConfigError);
    try {
      load();
    } catch (error) {
      expect(error.problems).toEqual([
        "MONGO_URL is missing",
        "RABBITMQ_URL must be a full URL",
        "PORT must be 0 to 65535",
        "INTERNAL_TOKEN is missing",
        "AUTH_PUBLIC_KEY must be a PEM key",
      ]);
      expect(error.message).not.toContain("secret-password");
    }
  });

  it("rejects numbers that aren't whole", () => {
    expect(() =>
      loadConfig({ PORT: { type: "port" } }, { PORT: "30.5" }),
    ).toThrow("PORT must be a whole number");
  });

  it("refuses a type it doesn't know", () => {
    expect(() => loadConfig({ X: { type: "date" } }, { X: "1" })).toThrow(
      TypeError,
    );
  });
});
