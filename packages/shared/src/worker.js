import {
  connectEvents,
  createDurable,
  createLogger,
  createTokenVerifier,
  loadConfig,
  startService,
} from "./index.js";

/** Common startup without owning any service's database models or business rules. */
export async function runBackend({
  service,
  port,
  connectDatabase,
  createStore,
  createApp,
  configure,
  variables = {},
}) {
  const config = loadConfig({
    PORT: { type: "port", default: port },
    MONGO_URL: { type: "url" },
    RABBITMQ_URL: { type: "url" },
    AUTH_PUBLIC_KEY: { type: "pem" },
    INTERNAL_TOKEN: {},
    LOG_LEVEL: { default: "info" },
    ...variables,
  });
  const logger = createLogger({ service, level: config.LOG_LEVEL });
  const connection = await connectDatabase(config.MONGO_URL, service);
  const topology = await connection.db.admin().command({ hello: 1 });
  if (!topology.setName && topology.msg !== "isdbgrid") {
    await connection.close();
    throw new Error(
      "This service requires a MongoDB replica set for transactions.",
    );
  }
  const store = createStore(connection);
  await store.init();
  const durable = createDurable(connection);
  const events = await connectEvents({
    url: config.RABBITMQ_URL,
    service,
    logger,
  });
  const extra = await configure(config);
  const app = createApp({
    ...extra,
    store,
    durable,
    logger,
    verifyToken: await createTokenVerifier(config.AUTH_PUBLIC_KEY),
    internalToken: config.INTERNAL_TOKEN,
    ready: {
      database: () => connection.readyState === 1,
      events: events.isReady,
    },
  });
  await events.consume(app.locals.service.handlers);
  let active;
  const tick = () => {
    active ??= (async () => {
      try {
        await app.locals.service.maintenance?.();
      } catch {
        logger.warn("Maintenance failed; retrying on the next tick.");
      }
      await durable.flush(events);
    })()
      .catch(() => logger.warn("Background work failed; retrying."))
      .finally(() => {
        active = undefined;
      });
  };
  const timer = setInterval(tick, 1000);
  timer.unref();
  tick();
  return startService({
    app,
    port: config.PORT,
    logger,
    async onStop() {
      clearInterval(timer);
      await active;
      await events.close();
      await connection.close();
    },
  });
}
