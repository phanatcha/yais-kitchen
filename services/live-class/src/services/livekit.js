import {
  AccessToken,
  RoomServiceClient,
  EgressClient,
  WebhookReceiver,
  EncodedFileOutput,
  S3Upload,
} from "livekit-server-sdk";
import { serviceUnavailable } from "@yais-kitchen/shared";

/** Storage outputs are supplied by media, never owned by this service. */
export function createLiveKitProvider({ url, apiKey, apiSecret, media }) {
  const httpUrl = url.replace(/^ws/, "http");
  const rooms = new RoomServiceClient(httpUrl, apiKey, apiSecret);
  const egress = new EgressClient(httpUrl, apiKey, apiSecret);
  const receiver = new WebhookReceiver(apiKey, apiSecret);
  return {
    serverUrl: url,
    verify: (raw, authorization) =>
      receiver.receive(raw.toString("utf8"), authorization),
    async room(name) {
      const existing = await rooms.listRooms([name]);
      if (!existing.length)
        await rooms.createRoom({
          name,
          maxParticipants: 10,
          emptyTimeout: 600,
        });
    },
    async participants(name) {
      try {
        return await rooms.listParticipants(name);
      } catch (error) {
        if (error.code === "not_found") return [];
        throw error;
      }
    },
    async token(room, identity) {
      const token = new AccessToken(apiKey, apiSecret, { identity, ttl: 120 });
      token.addGrant({
        roomJoin: true,
        room,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
      });
      return token.toJwt();
    },
    broadcast: (room, message) =>
      rooms.sendData(
        room,
        new TextEncoder().encode(JSON.stringify(message)),
        0,
      ),
    async start(room) {
      if (!media)
        throw serviceUnavailable("Media recording storage is not configured.");
      const output = await media("/internal/media/recording-output", { room });
      if (!output.filepath?.startsWith("recordings/") || !output.s3)
        throw serviceUnavailable("Private recording storage is unavailable.");
      return egress.startRoomCompositeEgress(
        room,
        new EncodedFileOutput({
          filepath: output.filepath,
          output: { case: "s3", value: new S3Upload(output.s3) },
        }),
        { layout: "grid" },
      );
    },
    async stop(egressId) {
      try {
        return await egress.stopEgress(egressId);
      } catch (error) {
        if (error.code !== "not_found") throw error;
      }
    },
    activeRecordings: (roomName) =>
      egress.listEgress({ roomName, active: true }),
    async end(room) {
      try {
        return await rooms.deleteRoom(room);
      } catch (error) {
        if (error.code !== "not_found") throw error;
      }
    },
  };
}
