# Infra

Runs the whole back end on one machine with Docker Compose: MongoDB, RabbitMQ, Mailpit, the mock server, and every service that is built so far.

| File                 | What                                                                    |
| -------------------- | ----------------------------------------------------------------------- |
| `docker-compose.yml` | Every container, its ports and its settings                             |
| `Dockerfile`         | One image recipe for every Node service, picked with `SERVICE`          |
| `setup.js`           | Makes `.env` and fills in the keys and the internal token               |
| `stack.test.js`      | Checks the running stack through the gateway, the way the web app would |

## First time

You need Node 22 and Docker running. From the repo root:

```bash
npm install
```

```bash
npm run setup
```

```bash
npm run up
```

`npm run setup` copies `.env.example` to `.env` and makes auth's key pair and the internal token. It never changes a value that is already set, so it is safe to run again. `npm run up` builds the images, starts everything, and waits until each one says it is ready. The first build takes a few minutes.

Then fill the catalog with sample Yais and make yourself an admin:

```bash
npm run seed -w @yais-kitchen/catalog
```

```bash
npm run create-admin -w @yais-kitchen/auth -- you@example.com "Your name"
```

Sign in as that admin with a code, like anyone else. The code arrives in Mailpit.

## Addresses

Everything listens on this machine only.

| What         | Address                   | Notes                                           |
| ------------ | ------------------------- | ----------------------------------------------- |
| Gateway      | http://localhost:8080     | The only one the web app calls, under `/api`    |
| Mailpit      | http://localhost:8025     | Every email sent, such as sign-in codes         |
| RabbitMQ     | http://localhost:15672    | Queues and messages. User and password `guest`. |
| Mock server  | http://localhost:4010     | Answers for services that aren't built yet      |
| Auth         | http://localhost:3001     |                                                 |
| Catalog      | http://localhost:3002     |                                                 |
| Notification | http://localhost:3007     | Only `/health` and `/ready`. It has no API.     |
| MongoDB      | mongodb://localhost:27017 | One database per service                        |

## Every day

| To                               | Run                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| Start, or rebuild after pulling  | `npm run up`                                                                               |
| Stop, keeping the data           | `npm run down`                                                                             |
| Stop and delete every database   | `docker compose -f infra/docker-compose.yml down -v`                                       |
| See what is running              | `docker compose -f infra/docker-compose.yml ps`                                            |
| Follow one service's logs        | `docker compose -f infra/docker-compose.yml logs -f auth`                                  |
| Check the stack works end to end | `GATEWAY_URL=http://127.0.0.1:8080 MAILPIT_URL=http://127.0.0.1:8025 npx vitest run infra` |

After changing `.env`, run `npm run up` again so the containers pick it up.

## Working on one service

Stop its container and run it with npm instead, which restarts on every save:

```bash
docker compose -f infra/docker-compose.yml stop catalog
```

```bash
npm run catalog
```

It reads the root `.env`, where the addresses are `localhost`, and uses the same MongoDB and RabbitMQ as the containers. The gateway in Docker still sends to the stopped container, so either call your service straight on its port, or stop the gateway too and run `npm run gateway` with that service's URL set in `.env`, such as `CATALOG_URL=http://127.0.0.1:3002`.

## How the settings work

Every service reads the root `.env`. Inside Docker the other containers aren't at `localhost`, so `docker-compose.yml` sets the addresses (`MONGO_URL`, `RABBITMQ_URL`, `MOCK_URL`, `AUTH_URL`, `CATALOG_URL`, `SMTP_HOST`) for each container, and those win over `.env`. Everything else, such as the keys, comes from `.env`.

## Adding a service

When booking, payment, live-class or media is built:

1. Copy the `catalog` block in `docker-compose.yml`, change the name, `SERVICE`, the port and the `/ready` address.
2. Add its URL to the gateway's `environment`, such as `BOOKING_URL: http://booking:3003`, and add it to the gateway's `depends_on`. Until then the gateway sends its paths to the mock server.
3. If notification reads from it, give notification its URL too.
4. Add a check to `stack.test.js` for one of its paths, and change the mock check there if it used this service.

## In CI

The `stack` job in `.github/workflows/ci.yml` does exactly the first-time steps above on a clean machine, then runs `stack.test.js`. If it fails, the job prints every container's logs.
