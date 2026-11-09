import { createApp } from "@yais-kitchen/shared";
import express from "express";
import { createApplications } from "./applications.js";
import { createCatalog } from "./catalog.js";
import { createSchedule } from "./schedule.js";
import { createViews } from "./views.js";

// The spec validator has already checked query values. These read them
// whether or not it turned them into numbers and booleans.
const int = (value, fallback) =>
  value === undefined ? fallback : Number(value);
const bool = (value) =>
  value === undefined ? undefined : value === true || value === "true";
const listQuery = (query) => ({
  limit: int(query.limit, 20),
  cursor: query.cursor,
});

/**
 * @param {{ catalog: ReturnType<typeof createCatalog>, schedule: ReturnType<typeof createSchedule>, applications: ReturnType<typeof createApplications> }} parts
 */
export function catalogRoutes({ catalog, schedule, applications }) {
  const routes = express.Router();

  // Yais, classes and recipes
  routes.get("/catalog/yais", async (req, res) => {
    const { q, region } = req.query;
    res.json(
      await catalog.listYais(
        {
          q,
          region,
          featured: bool(req.query.featured),
          includeHidden: bool(req.query.includeHidden) ?? false,
          ...listQuery(req.query),
        },
        req.user,
      ),
    );
  });
  routes.post("/catalog/yais", async (req, res) => {
    res.status(201).json(await catalog.createYai(req.body));
  });
  routes.get("/catalog/yais/:yaiId", async (req, res) => {
    res.json(await catalog.getYai(req.params.yaiId, req.user));
  });
  routes.patch("/catalog/yais/:yaiId", async (req, res) => {
    res.json(await catalog.updateYai(req.params.yaiId, req.body));
  });

  routes.get("/catalog/classes", async (req, res) => {
    const { q, yaiId, region } = req.query;
    res.json(
      await catalog.listClasses(
        {
          q,
          yaiId,
          region,
          maxPrice: int(req.query.maxPrice),
          featured: bool(req.query.featured),
          includeHidden: bool(req.query.includeHidden) ?? false,
          ...listQuery(req.query),
        },
        req.user,
      ),
    );
  });
  routes.post("/catalog/classes", async (req, res) => {
    res.status(201).json(await catalog.createClass(req.body));
  });
  routes.get("/catalog/classes/:classId", async (req, res) => {
    res.json(await catalog.getClass(req.params.classId, req.user));
  });
  routes.patch("/catalog/classes/:classId", async (req, res) => {
    res.json(await catalog.updateClass(req.params.classId, req.body));
  });
  routes.get("/catalog/classes/:classId/recipe", async (req, res) => {
    res.json(await catalog.getRecipe(req.params.classId, req.user));
  });
  routes.put("/catalog/classes/:classId/recipe", async (req, res) => {
    res.json(await catalog.putRecipe(req.params.classId, req.body));
  });

  // Available times and class times
  routes.get("/catalog/yais/:yaiId/available-times", async (req, res) => {
    const { from, to } = req.query;
    res.json(
      await schedule.listAvailableTimes(
        req.params.yaiId,
        { from, to, ...listQuery(req.query) },
        req.user,
      ),
    );
  });
  routes.post("/catalog/yais/:yaiId/available-times", async (req, res) => {
    res
      .status(201)
      .json(
        await schedule.addAvailableTime(req.params.yaiId, req.body, req.user),
      );
  });
  routes.delete(
    "/catalog/yais/:yaiId/available-times/:availableTimeId",
    async (req, res) => {
      await schedule.deleteAvailableTime(
        req.params.yaiId,
        req.params.availableTimeId,
        req.user,
      );
      res.status(204).end();
    },
  );
  routes.get("/catalog/class-times", async (req, res) => {
    const { yaiId, status, from, to } = req.query;
    res.json(
      await schedule.listClassTimes(
        { yaiId, status, from, to, ...listQuery(req.query) },
        req.user,
      ),
    );
  });
  routes.post("/catalog/class-times", async (req, res) => {
    res.status(201).json(await schedule.createClassTime(req.body));
  });
  routes.patch("/catalog/class-times/:classTimeId", async (req, res) => {
    res.json(await schedule.updateClassTime(req.params.classTimeId, req.body));
  });

  // FAQ and applications
  routes.get("/catalog/faq", async (req, res) => {
    res.json(await catalog.getFaq());
  });
  routes.put("/catalog/faq", async (req, res) => {
    res.json(await catalog.putFaq(req.body));
  });
  routes.post("/catalog/applications", async (req, res) => {
    res.status(201).json(await applications.submit(req.body));
  });
  routes.get("/catalog/applications", async (req, res) => {
    res.json(
      await applications.list({
        stage: req.query.stage,
        ...listQuery(req.query),
      }),
    );
  });
  routes.patch("/catalog/applications/:applicationId", async (req, res) => {
    res.json(await applications.update(req.params.applicationId, req.body));
  });

  // For booking, live-class and notification
  routes.get("/internal/catalog/class-times", async (req, res) => {
    const { classId, from, to } = req.query;
    res.json(await schedule.internalListClassTimes({ classId, from, to }));
  });
  routes.get("/internal/catalog/class-times/:classTimeId", async (req, res) => {
    res.json(await schedule.internalGetClassTime(req.params.classTimeId));
  });

  return routes;
}

/**
 * The catalog service's Express app. The spec checks every request, and the
 * role from `x-roles`, before a route runs.
 */
export function createCatalogApp({
  store,
  events,
  mediaPublicUrl,
  verifyToken,
  internalToken,
  logger,
  ready,
  now,
  validateResponses = false,
}) {
  const views = createViews(mediaPublicUrl);
  const parts = {
    catalog: createCatalog({ store, views, now }),
    schedule: createSchedule({ store, views, events, now }),
    applications: createApplications({ store, views, events, now }),
  };
  return createApp({
    service: "catalog",
    logger,
    routes: catalogRoutes(parts),
    auth: { verifyToken, internalToken },
    ready,
    validateResponses,
  });
}
