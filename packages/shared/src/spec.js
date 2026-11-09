import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as OpenApiValidator from "express-openapi-validator";
import { parse } from "yaml";

export const API_SPEC_PATH = fileURLToPath(
  import.meta.resolve("@yais-kitchen/api-spec/openapi.yaml"),
);

const METHODS = ["get", "put", "post", "patch", "delete"];

/**
 * Reads the OpenAPI spec for one service. Services serve the spec's paths
 * from their root (`/catalog/yais`), because the gateway takes `/api` off the
 * front. Each operation gets its `security` spelled out, so code that reads
 * `req.openapi.schema.security` never has to look at the top of the spec.
 */
export function loadApiSpec(path = API_SPEC_PATH) {
  const spec = parse(readFileSync(path, "utf8"));
  spec.servers = [{ url: "/" }];
  for (const item of Object.values(spec.paths ?? {})) {
    for (const method of METHODS) {
      if (item[method]) item[method].security ??= spec.security ?? [];
    }
  }
  return spec;
}

/**
 * Rejects any request that doesn't match the spec: unknown paths, wrong
 * methods, extra or missing fields and bad query values. With
 * `validateResponses`, a response that doesn't match is an error too, which
 * is how tests catch code drifting away from the spec.
 */
export function specValidator(spec, { validateResponses = false } = {}) {
  return OpenApiValidator.middleware({
    // A copy, because the validator changes the object it is given.
    apiSpec: structuredClone(spec),
    validateRequests: { allErrors: true },
    validateResponses,
    // authorizeFromSpec checks tokens, with jose.
    validateSecurity: false,
    fileUploader: false,
  });
}
