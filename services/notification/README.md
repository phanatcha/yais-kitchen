# Notification

Sends every email the product sends. It has no API of its own: it listens for events, writes plain-text emails in plain English, and sends them over SMTP. Locally, Mailpit catches them all, so nothing reaches a real inbox.

## Emails

| Event                  | Email                                                                     | To                                       |
| ---------------------- | ------------------------------------------------------------------------- | ---------------------------------------- |
| `auth.code_requested`  | The sign-in code. Skipped if the code ran out before it could go.         | The person signing in                    |
| `application.received` | "We got the application", and a note for Admin with a link to it          | The family, and `ADMIN_EMAIL`            |
| `booking.confirmed`    | The booking with the shopping list. Plans the reminders.                  | The tourist                              |
| (timer)                | "See you soon" 24 hours before class, "Starting in 1 hour" an hour before | The tourist                              |
| `booking.cancelled`    | Why it was cancelled and what comes back. Cancels the reminders.          | The tourist                              |
| `payment.refunded`     | The refund is on its way                                                  | The tourist                              |
| `live_class.ended`     | Thank you, with a link to After Class                                     | Every tourist still booked on that class |
| `recording.ready`      | The recording is ready, and until when                                    | Every tourist still booked on that class |
| `user.deleted`         | No email. Forgets that person's bookings, reminders and email log.        |                                          |

Dish and ingredient names also appear in Thai script, such as "Khao Soi (ข้าวซอย)", so a tourist can show them at a market. Times are Thai time.

The Thai dish name and the shopping list come from catalog's `GET /internal/catalog/class-times/{classTimeId}`. Without `CATALOG_URL`, the mock server answers. If catalog can't be reached on any of the 5 tries, the booking email goes out without the list, which is also on the Get Ready page.

## How it stays right

- Every event is checked against `asyncapi.yaml` before it is handled. One that doesn't match goes straight to the dead-letter queue.
- Each event is handled once. Its ID is saved when it is done, and a repeat is skipped.
- Each email is claimed in MongoDB before it is sent. Two copies of one event arriving together send one email, and a retry after a failure sends only what is missing.
- Events can arrive out of order. A booking cancelled before its confirmation arrives gets no confirmation and no reminders, and a refund that arrives before its cancellation is tried again later.
- Reminders are checked every `REMINDER_CHECK_MS`. Each one is claimed by one instance, so running several never sends one twice. A reminder that is too late is skipped (the 24-hour one less than 2 hours before class, the 1-hour one once class has started). A failing one is tried 5 times.
- Sign-in codes and addresses are never stored or logged.

## What it keeps

In the `notification` database. Each collection deletes old entries by itself.

| Collection       | What                                                       | Kept for                        |
| ---------------- | ---------------------------------------------------------- | ------------------------------- |
| `handled_events` | IDs of events already handled                              | 30 days                         |
| `sent_emails`    | One entry per email: its key, template, person ID and when | 90 days                         |
| `bookings`       | What the emails need about each booking                    | Until 90 days after the class   |
| `reminders`      | Planned reminders and what happened to them                | 30 days after they are finished |

## Run it

Until `infra/` has a Docker Compose file, start RabbitMQ, MongoDB and Mailpit by hand:

```bash
docker run --rm -d --name yk-rabbit --user rabbitmq -p 127.0.0.1:5672:5672 rabbitmq:4-alpine
```

```bash
docker run --rm -d --name yk-mongo -p 127.0.0.1:27017:27017 mongo:8
```

```bash
docker run --rm -d --name yk-mailpit -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit
```

Then, each in its own terminal, with the root `.env` filled in:

```bash
npm run mock
```

```bash
npm run notification
```

```bash
npm run send-sample -w @yais-kitchen/notification
```

The last one sends a sample of every event, and the emails appear at http://localhost:8025. Name an event to send just that one, such as `-- booking.confirmed`.

## Environment

| Variable                     | Default                                    | What                                                   |
| ---------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| `MONGO_URL`                  | required                                   | MongoDB. The service uses the `notification` database. |
| `RABBITMQ_URL`               | required                                   | RabbitMQ                                               |
| `SMTP_HOST`, `SMTP_PORT`     | required                                   | Mailpit locally (`localhost`, `1025`)                  |
| `SMTP_USER`, `SMTP_PASSWORD` | not set                                    | For a real mail server                                 |
| `EMAIL_FROM`                 | `Yai's Kitchen <hello@yais-kitchen.local>` | Who emails come from                                   |
| `ADMIN_EMAIL`                | required                                   | Gets a note for each Become a Yai application          |
| `WEB_ORIGIN`                 | required                                   | The web app, for links in emails                       |
| `INTERNAL_TOKEN`             | required                                   | For catalog's internal API                             |
| `CATALOG_URL`                | not set                                    | Catalog. When not set, `MOCK_URL`.                     |
| `MOCK_URL`                   | `http://127.0.0.1:4010`                    | The mock server                                        |
| `REMINDER_CHECK_MS`          | `30000`                                    | How often to look for due reminders                    |
| `PORT`                       | `3007`                                     | For `/health` and `/ready`                             |
| `LOG_LEVEL`                  | `info`                                     |                                                        |

## Links in emails

`src/links.js` builds them, and the web app's routes must match:

- `/bookings/{bookingId}/get-ready`
- `/bookings/{bookingId}/after-class`
- `/admin/applications/{applicationId}`

## Tests

`npm test` runs them with a MongoDB in memory. The first run downloads MongoDB, which takes a while.

`test/notification.e2e.test.js` goes through real RabbitMQ, MongoDB and Mailpit, and runs only when all three are set. Stop the notification service first, or it sends the same emails too:

```bash
RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5672 MONGO_URL=mongodb://127.0.0.1:27017 MAILPIT_URL=http://127.0.0.1:8025 npm test
```
