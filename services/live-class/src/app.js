import express from "express";
import { rateLimit } from "express-rate-limit";
import { createApp, tooManyRequests } from "@yais-kitchen/shared";
import { createLiveService } from "./services/live.js";
export function createLiveApp(options) {
  const service = createLiveService(options);
  const routes = express.Router();
  const base = "/live/class-times/:classTimeId";
  routes.post(
    `${base}/join`,
    rateLimit({
      windowMs: 60000,
      limit: 30,
      handler: (req, res, next) => next(tooManyRequests(60)),
    }),
    async (req, res) =>
      res.json(await service.join(req.params.classTimeId, req.user)),
  );
  routes.get(`${base}/state`, async (req, res) =>
    res.json(await service.state(req.params.classTimeId, req.user)),
  );
  routes.put(`${base}/step`, async (req, res) =>
    res.json(
      await service.step(
        req.params.classTimeId,
        req.body.index,
        req.user,
        req.body.version,
      ),
    ),
  );
  routes.post(`${base}/consent`, async (req, res) =>
    res.json(
      await service.consent(req.params.classTimeId, req.body.agree, req.user),
    ),
  );
  routes.post(`${base}/recording`, async (req, res) =>
    res.json(
      await service.recording(
        req.params.classTimeId,
        req.body.action,
        req.user,
      ),
    ),
  );
  routes.get(`${base}/recording`, async (req, res) =>
    res.json(await service.recordingLink(req.params.classTimeId, req.user)),
  );
  routes.post(`${base}/captions`, async (req, res) =>
    res.json(await service.caption(req.params.classTimeId, req.body, req.user)),
  );
  routes.post(`${base}/end`, async (req, res) =>
    res.json(await service.end(req.params.classTimeId, req.user)),
  );
  routes.post("/live/webhooks/livekit", async (req, res) => {
    await service.webhook(req.rawBody, req.get("authorization"));
    res.status(200).end();
  });
  const app = createApp({
    ...options,
    service: "live-class",
    routes,
    auth: {
      verifyToken: options.verifyToken,
      internalToken: options.internalToken,
    },
  });
  app.locals.service = service;
  return app;
}
