import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { AccessToken, TokenVerifier } from "livekit-server-sdk";
import { createLiveKitProvider } from "../src/services/livekit.js";
import {
  ManualCaptionAdapter,
  MockTranscriptionAdapter,
} from "../src/services/captions.js";

const apiKey = "test-api-key";
const apiSecret = "test-api-secret-at-least-thirty-two-characters";
const provider = createLiveKitProvider({
  url: "wss://example.test",
  apiKey,
  apiSecret,
});
describe("official LiveKit SDK boundary", () => {
  it("signs a two-minute room-scoped token without data publishing permission", async () => {
    const token = await provider.token("class-test", "tourist-test");
    const claims = await new TokenVerifier(apiKey, apiSecret).verify(token);
    expect(claims.video).toMatchObject({
      roomJoin: true,
      room: "class-test",
      canPublishData: false,
    });
    expect(claims.exp - claims.nbf).toBeLessThanOrEqual(120);
  });
  it("verifies signed webhook body digest with the official receiver", async () => {
    const raw = JSON.stringify({
      event: "participant_joined",
      id: "EV_test",
      room: { name: "class-test" },
    });
    const signature = new AccessToken(apiKey, apiSecret);
    signature.sha256 = createHash("sha256").update(raw).digest("base64");
    const token = await signature.toJwt();
    expect((await provider.verify(Buffer.from(raw), token)).event).toBe(
      "participant_joined",
    );
    await expect(
      provider.verify(Buffer.from(raw + " "), token),
    ).rejects.toThrow(/checksum/);
  });
  it("rejects unsigned provider callbacks", async () => {
    await expect(
      provider.verify(Buffer.from("{}"), "bad-signature"),
    ).rejects.toThrow();
  });
  it("fails closed when media storage is unavailable", async () => {
    await expect(provider.start("class-test")).rejects.toMatchObject({
      status: 503,
    });
  });
  it("explicitly exposes manual-only transcription and a deterministic test adapter", async () => {
    await expect(new ManualCaptionAdapter().transcribe()).rejects.toThrow(
      /not configured/,
    );
    const values = [];
    for await (const segment of new MockTranscriptionAdapter([
      { language: "th", text: "test" },
    ]).transcribe())
      values.push(segment);
    expect(values).toEqual([{ language: "th", text: "test" }]);
  });
});
