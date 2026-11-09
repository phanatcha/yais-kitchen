import express from "express";
import { createApp } from "../src/index.js";

// A tiny service built from the starter. It borrows two auth paths from the
// spec to show a public route and a signed-in route. The real auth service
// replaces it.
export function createExampleApp({
  logger,
  verifyToken,
  ready,
  validateResponses,
}) {
  const routes = express.Router();

  // Public in the spec (`security: []`), so no token is needed.
  routes.post("/auth/codes", (req, res) => res.status(202).end());

  // The spec allows tourist, family, helper and admin here, so the starter
  // has already checked the token and the role before this runs.
  routes.get("/auth/me", (req, res) => {
    const { id, email, name, role, yaiId } = req.user;
    res.json({ id, email, name, role, ...(yaiId && { yaiId }) });
  });

  return createApp({
    service: "example",
    logger,
    routes,
    auth: { verifyToken },
    ready,
    validateResponses,
  });
}
