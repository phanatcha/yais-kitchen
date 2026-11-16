import { useQueryClient } from "@tanstack/react-query";
import { Room, RoomEvent, Track } from "livekit-client";
import { useEffect, useReducer, useState } from "react";
import { liveKitUrl, liveStateKey, requestJoinTicket } from "./live.js";

// Room changes that change what the call shows.
const REDRAW_ON = [
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.ParticipantNameChanged,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.ActiveSpeakersChanged,
];

/** Who someone is in the class, from the identity live-class gives them. */
export function roleOf(participant) {
  return participant.identity.split("-")[0];
}

/** The track someone sends from their camera or microphone, if any. */
export function trackOf(participant, source) {
  const publication = participant.getTrackPublication(source);
  return publication && !publication.isMuted ? publication.track : undefined;
}

export const CAMERA = Track.Source.Camera;
export const MICROPHONE = Track.Source.Microphone;

/**
 * Joins the class's LiveKit room: asks live-class for a ticket (it works for
 * 2 minutes), connects, then turns on the camera and microphone. Leaving the
 * page or passing `enabled: false` leaves the call.
 *
 * `room` is null until connected. `status` is connecting, connected,
 * reconnecting, disconnected or failed (with `error`). A camera or
 * microphone the browser won't give is `deviceError`: the person still sees
 * and hears the others. `retry()` joins again after a failure.
 */
export function useLiveCall(classTimeId, { enabled = true } = {}) {
  const queryClient = useQueryClient();
  const [attempt, setAttempt] = useState(0);
  const [call, setCall] = useState({
    room: null,
    status: "connecting",
    error: null,
    deviceError: null,
    canPlayAudio: true,
  });
  const [, redraw] = useReducer((n) => n + 1, 0);

  useEffect(() => {
    if (!enabled || !classTimeId) return undefined;
    let left = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    const update = (patch) => {
      if (!left) setCall((current) => ({ ...current, ...patch }));
    };

    for (const event of REDRAW_ON) room.on(event, redraw);
    room.on(RoomEvent.Reconnecting, () => update({ status: "reconnecting" }));
    room.on(RoomEvent.Reconnected, () => update({ status: "connected" }));
    room.on(RoomEvent.Disconnected, () => {
      update({ status: "disconnected", room: null });
      // Ending the class closes the room, so check whether that happened.
      queryClient.invalidateQueries({ queryKey: liveStateKey(classTimeId) });
    });
    room.on(RoomEvent.AudioPlaybackStatusChanged, () =>
      update({ canPlayAudio: room.canPlaybackAudio }),
    );
    room.on(RoomEvent.MediaDevicesError, (error) =>
      update({ deviceError: error }),
    );
    // live-class sends the recipe step and recording state as data messages.
    room.on(RoomEvent.DataReceived, () =>
      queryClient.invalidateQueries({ queryKey: liveStateKey(classTimeId) }),
    );

    (async () => {
      try {
        const ticket = await requestJoinTicket(classTimeId);
        if (left) return;
        await room.connect(liveKitUrl(ticket), ticket.token);
        if (left) {
          await room.disconnect();
          return;
        }
        update({
          room,
          status: "connected",
          error: null,
          canPlayAudio: room.canPlaybackAudio,
        });
        try {
          await room.localParticipant.enableCameraAndMicrophone();
        } catch (error) {
          update({ deviceError: error });
        }
        redraw();
      } catch (error) {
        update({ status: "failed", error });
      }
    })();

    return () => {
      left = true;
      room.removeAllListeners();
      room.disconnect();
    };
  }, [classTimeId, enabled, attempt, queryClient]);

  const room = enabled ? call.room : null;
  return {
    ...call,
    room,
    retry() {
      setCall((current) => ({
        ...current,
        status: "connecting",
        error: null,
        deviceError: null,
      }));
      setAttempt((n) => n + 1);
    },
    async setMicrophone(on) {
      try {
        await room?.localParticipant.setMicrophoneEnabled(on);
        setCall((current) => ({ ...current, deviceError: null }));
      } catch (error) {
        setCall((current) => ({ ...current, deviceError: error }));
      }
      redraw();
    },
    async setCamera(on) {
      try {
        await room?.localParticipant.setCameraEnabled(on);
        setCall((current) => ({ ...current, deviceError: null }));
      } catch (error) {
        setCall((current) => ({ ...current, deviceError: error }));
      }
      redraw();
    },
    async startAudio() {
      await room?.startAudio();
      setCall((current) => ({
        ...current,
        canPlayAudio: room?.canPlaybackAudio ?? true,
      }));
    },
  };
}
