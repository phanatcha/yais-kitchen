import { logContext } from "@yais-kitchen/shared";
import { describe, expect, it } from "vitest";
import { createCatalogClient } from "../src/catalog.js";

function fakeFetch(status, body) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fetch };
}

const client = (fetch) =>
  createCatalogClient({
    baseUrl: "http://catalog:3002",
    internalToken: "a-secret-of-at-least-thirty-two-characters",
    fetch,
  });

describe("catalog client", () => {
  it("asks with the internal token and the request ID, and keeps what emails need", async () => {
    const { calls, fetch } = fakeFetch(200, {
      classTime: { id: "c1" },
      class: { dish: "Khao Soi", dishThai: "ข้าวซอย", price: {} },
      yai: { name: "Yai Somsri" },
      ingredients: [
        {
          id: "egg-noodles",
          name: "Fresh egg noodles",
          nameThai: "บะหมี่ไข่",
          quantity: "200 g",
        },
      ],
    });

    const details = await logContext.run({ requestId: "req_abc12345" }, () =>
      client(fetch).getClassTime("6650a1f2c3d4e5f6a7b8c9e2"),
    );

    expect(calls[0].url).toBe(
      "http://catalog:3002/internal/catalog/class-times/6650a1f2c3d4e5f6a7b8c9e2",
    );
    expect(calls[0].init.headers).toMatchObject({
      "x-internal-token": "a-secret-of-at-least-thirty-two-characters",
      "x-request-id": "req_abc12345",
    });
    expect(details).toEqual({
      dishThai: "ข้าวซอย",
      ingredients: [
        { name: "Fresh egg noodles", nameThai: "บะหมี่ไข่", quantity: "200 g" },
      ],
    });
  });

  it("gives null for a class time catalog doesn't know", async () => {
    const { fetch } = fakeFetch(404, { error: {} });
    await expect(client(fetch).getClassTime("x")).resolves.toBeNull();
  });

  it("throws when catalog fails, so the event is tried again", async () => {
    const { fetch } = fakeFetch(503, { error: {} });
    await expect(client(fetch).getClassTime("x")).rejects.toThrow(
      "Catalog answered 503.",
    );
  });
});
