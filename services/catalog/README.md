# Catalog

Everything tourists browse (Yais, classes, recipes, the FAQ), the times each Yai can teach, the class times made from them, and Become a Yai applications.

## Who does what

| Who     | What                                                                                                                                                             |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anyone  | Browses visible Yais and classes, searches and filters them, reads recipes and the FAQ, and applies to become a Yai                                              |
| Family  | Adds and removes the times their own Yai can teach, and sees her class times                                                                                     |
| Helper  | Sees the class times they are assigned to                                                                                                                        |
| Admin   | Adds, edits, shows and hides Yais and classes, writes recipes and the FAQ, makes class times, assigns helpers, cancels class times, and moves applications along |
| Booking | Reads published class times and one class time with its class, Yai and shopping list (`/internal`, with `X-Internal-Token`)                                      |

## Endpoints

Paths as the gateway shows them, under `/api`. `openapi.yaml` has every field and answer.

| Endpoint                                                    | Who                   | What                                                 |
| ----------------------------------------------------------- | --------------------- | ---------------------------------------------------- |
| `GET /catalog/yais`                                         | Anyone                | Browse and search Yais                               |
| `GET /catalog/yais/{yaiId}`                                 | Anyone                | A Yai's profile and her classes                      |
| `POST /catalog/yais`, `PATCH /catalog/yais/{yaiId}`         | Admin                 | Add, edit, show or hide a Yai                        |
| `GET /catalog/classes`                                      | Anyone                | Browse and search classes                            |
| `GET /catalog/classes/{classId}`                            | Anyone                | Class detail                                         |
| `POST /catalog/classes`, `PATCH /catalog/classes/{classId}` | Admin                 | Add, edit, show or hide a class                      |
| `GET /catalog/classes/{classId}/recipe`                     | Anyone                | The recipe card and shopping list                    |
| `PUT /catalog/classes/{classId}/recipe`                     | Admin                 | Write the recipe                                     |
| `GET`, `POST /catalog/yais/{yaiId}/available-times`         | Family, Admin         | When the Yai can teach, and adding a time            |
| `DELETE /catalog/yais/{yaiId}/available-times/{id}`         | Family, Admin         | Remove a time                                        |
| `GET /catalog/class-times`                                  | Admin, Helper, Family | Class times each of them may see                     |
| `POST /catalog/class-times`                                 | Admin                 | Make a class time from an available time             |
| `PATCH /catalog/class-times/{classTimeId}`                  | Admin                 | Assign a helper or cancel                            |
| `GET /catalog/faq`, `PUT /catalog/faq`                      | Anyone, Admin         | Read and edit the FAQ                                |
| `POST /catalog/applications`                                | Anyone                | Apply to become a Yai                                |
| `GET /catalog/applications`, `PATCH .../{applicationId}`    | Admin                 | List applications and move them along                |
| `GET /internal/catalog/class-times`                         | Booking               | Published class times of one class                   |
| `GET /internal/catalog/class-times/{classTimeId}`           | Booking, Notification | One class time with its class, Yai and shopping list |

The two `/internal` paths need `X-Internal-Token` and are never reachable through the gateway.

## Rules worth knowing

- **Hidden things.** A hidden Yai or class answers 404 to everyone but Admin. A class of a hidden Yai is hidden too. Admin sees hidden ones in lists with `includeHidden=true`.
- **Samples.** Every Yai has `isSample`, and every class shows its Yai's. The one real Yai has it off, and the site labels the rest "Sample".
- **Search.** `q` finds Yais by name (English or Thai), story, or a dish of one of her visible classes, and classes by dish or description. It ignores case and treats the text literally.
- **Starting price.** A Yai's `startingPrice` is the lowest price of her visible classes, or 0 while she has none.
- **Photos and videos** are kept as media asset IDs only. Catalog builds the links from `MEDIA_PUBLIC_URL`: `{assetId}/thumb.webp`, `card.webp` and `hero.webp` for photos, `{assetId}/video.mp4` and `poster.webp` for videos. Media must store ready files at those paths. Catalog doesn't check that an asset is ready.
- **Available times** start in the future, last at most 8 hours, and don't overlap. A family can only touch its own Yai's. Once Admin makes a class time from one, it can't be removed, even if that class time is cancelled later.
- **Class times** start when their available time starts and last as long as the class. Each available time makes one. A class time is a draft until it has a helper, then it is published. **Only published class times can be booked**: the internal list booking reads shows nothing else.
- **Cancelling** a class time sends `class_time.cancelled`, and booking cancels and refunds every booking for it. If the event can't be sent, the class time stays as it was and Admin gets 503. Started or cancelled class times can't change.
- **Helpers** are auth users. Catalog can't check a helper ID, so the admin pages pick it from `GET /api/auth/users?role=helper`.
- **Applications** go received, kitchen visit, trial class, then approved, and can be declined before the end. A new one sends `application.received`. If that can't be sent, the application isn't kept and the family gets 503, so they send it again.

## Events

| Event                  | When                             |
| ---------------------- | -------------------------------- |
| `application.received` | A family applied to become a Yai |
| `class_time.cancelled` | Admin cancelled a class time     |

Catalog doesn't receive any.

## What it keeps

In the `catalog` database: `yais`, `classes` (each with its recipe), `available_times`, `class_times`, `faq` and `applications`.

## Run it

`npm run up` starts it with everything else (see `infra/README.md`). To work on catalog itself, stop its container with `docker compose -f infra/docker-compose.yml stop catalog`, then:

```bash
npm run catalog
```

It listens on port 3002 and reads the root `.env`. Set `CATALOG_URL=http://127.0.0.1:3002` for a gateway or notification you run with npm, so they use it instead of the mock server.

To fill an empty catalog with three sample Yais, their classes and an FAQ:

```bash
npm run seed -w @yais-kitchen/catalog
```

Their photos point at placeholder asset IDs, so images stay blank until media has files for them.

## Environment

| Variable           | Default  | What                                                      |
| ------------------ | -------- | --------------------------------------------------------- |
| `MONGO_URL`        | required | MongoDB. The service uses the `catalog` database.         |
| `RABBITMQ_URL`     | required | RabbitMQ, to send events                                  |
| `AUTH_PUBLIC_KEY`  | required | Auth's public key, to check tokens                        |
| `INTERNAL_TOKEN`   | required | For booking, live-class and notification's internal calls |
| `MEDIA_PUBLIC_URL` | required | Where media serves ready photos and videos                |
| `PORT`             | `3002`   |                                                           |
| `LOG_LEVEL`        | `info`   |                                                           |

## Tests

`npm test` runs them with a MongoDB in memory and checks every answer against `openapi.yaml` and every event against `asyncapi.yaml`.
