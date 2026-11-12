import { randomUUID } from "node:crypto";
import { logContext, serviceUnavailable } from "./index.js";

/** Service-local durable transport. Business writes and enqueue share a transaction. */
export function createDurable(connection) {
  const collection = (name) => connection.collection(name);
  const outbox = collection("outbox");
  const inbox = collection("inbox");
  return {
    async transaction(work) {
      return connection.transaction(work);
    },
    async enqueue(session, type, data) {
      await outbox.insertOne(
        {
          _id: randomUUID(),
          type,
          data,
          createdAt: new Date(),
          requestId: logContext.getStore()?.requestId,
        },
        { session },
      );
    },
    async receive(event, work) {
      try {
        return await connection.transaction(async (session) => {
          if (await inbox.findOne({ _id: event.id }, { session })) return;
          await work(session);
          await inbox.insertOne(
            { _id: event.id, processedAt: new Date() },
            { session },
          );
        });
      } catch (error) {
        if (error.code === 11000 && (await inbox.findOne({ _id: event.id })))
          return;
        throw error;
      }
    },
    async flush(events) {
      // Stable envelope IDs are preserved across ambiguous broker failures.
      for await (const row of outbox.find({}).sort({ createdAt: 1, _id: 1 })) {
        await logContext.run({ requestId: row.requestId }, () =>
          events.publish(row.type, row.data, {
            id: row._id,
            occurredAt: row.createdAt.toISOString(),
          }),
        );
        await outbox.deleteOne({ _id: row._id });
      }
    },
  };
}

export function internalClient(base, token) {
  return async (path, body) => {
    let response;
    try {
      response = await fetch(new URL(path, base), {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "x-internal-token": token,
          "content-type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw serviceUnavailable();
    }
    if (!response.ok) throw serviceUnavailable();
    return response.json();
  };
}
