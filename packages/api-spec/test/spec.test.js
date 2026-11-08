import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const load = (file) =>
  parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));

const openapi = load("openapi.yaml");
const asyncapi = load("asyncapi.yaml");

const METHODS = ["get", "put", "post", "patch", "delete"];
const ROLES = ["guest", "tourist", "family", "helper", "admin"];
const PREFIXES = [
  "/auth/",
  "/catalog/",
  "/booking/",
  "/payment/",
  "/live/",
  "/media/",
];
const LAST_FR = 39;
// How It Works is a static page, so no endpoint or event serves it.
const NO_API = ["FR-02"];

const operations = Object.entries(openapi.paths).flatMap(([path, item]) =>
  METHODS.filter((method) => item[method]).map((method) => ({
    name: `${method.toUpperCase()} ${path}`,
    path,
    op: item[method],
  })),
);
const events = Object.entries(asyncapi.operations).map(([name, op]) => ({
  name,
  op,
}));

const isRequirement = (id) => {
  if (id === "privacy") return true;
  const match = /^FR-(\d{2})$/.exec(id);
  return Boolean(match) && Number(match[1]) >= 1 && Number(match[1]) <= LAST_FR;
};

describe("openapi.yaml", () => {
  it("gives every operation a unique operationId", () => {
    const ids = operations.map(({ op }) => op.operationId);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(operations)("$name says who may call it", ({ op }) => {
    const roles = op["x-roles"];
    expect(Array.isArray(roles)).toBe(true);
    for (const role of roles) expect(ROLES).toContain(role);

    const security = op.security ?? openapi.security;
    const needsToken =
      security.length > 0 && security.every((s) => "bearerAuth" in s);
    expect(roles.length > 0).toBe(needsToken);
  });

  it.each(operations)("$name names real requirements", ({ op }) => {
    const ids = op["x-requirements"];
    expect(ids?.length).toBeGreaterThan(0);
    for (const id of ids) expect(isRequirement(id), id).toBe(true);
  });

  it.each(operations)("$name sits under its service", ({ path, op }) => {
    if (path.startsWith("/internal/")) {
      expect(op.security).toEqual([{ internalToken: [] }]);
    } else {
      expect(PREFIXES.some((prefix) => path.startsWith(prefix))).toBe(true);
      expect(JSON.stringify(op.security ?? [])).not.toContain("internalToken");
    }
  });
});

describe("asyncapi.yaml", () => {
  it.each(events)("$name names real requirements", ({ op }) => {
    const ids = op["x-requirements"];
    expect(ids?.length).toBeGreaterThan(0);
    for (const id of ids) expect(isRequirement(id), id).toBe(true);
  });

  it.each(Object.entries(asyncapi.channels))(
    "%s has one sender and at least one reader",
    (key, channel) => {
      const uses = events.filter(
        ({ op }) => op.channel.$ref === `#/channels/${key}`,
      );
      expect(uses.filter(({ op }) => op.action === "send")).toHaveLength(1);
      expect(uses.some(({ op }) => op.action === "receive")).toBe(true);

      const [message] = Object.values(channel.messages);
      const name = message.$ref.split("/").pop();
      expect(asyncapi.components.messages[name].name).toBe(channel.address);
    },
  );
});

describe("requirements", () => {
  it("covers every functional requirement that needs the API", () => {
    const covered = new Set(
      [...operations, ...events].flatMap(
        ({ op }) => op["x-requirements"] ?? [],
      ),
    );
    const missing = [];
    for (let n = 1; n <= LAST_FR; n++) {
      const id = `FR-${String(n).padStart(2, "0")}`;
      if (!covered.has(id) && !NO_API.includes(id)) missing.push(id);
    }
    expect(missing).toEqual([]);
  });
});
