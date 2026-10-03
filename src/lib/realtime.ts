import { useEffect, useRef, useState, useCallback } from "react";
import { supabase, hasRealtime } from "./supabase";

export type Stroke = {
  points: { x: number; y: number }[];
  color: string;
  size: number;
  mode: "brush" | "eraser";
};

export type PresenceUser = {
  userId: string;
  name: string;
  avatar: string;
  role: "artist" | "spectator";
  joinedAt: number;
};

export type SubmissionPayload = {
  id: string;
  artistName: string;
  artistAvatar: string;
  image: string;
  strokes: Stroke[] | null;
  prompt: string;
  battleId: number;
  createdAt: number;
  votes: number;
};

export type RoomMessage =
  | { type: "stroke-start"; stroke: Stroke; userId: string }
  | { type: "stroke-point"; x: number; y: number; userId: string }
  | { type: "stroke-commit"; stroke: Stroke; userId: string }
  | { type: "clear"; userId: string }
  | { type: "cursor"; x: number; y: number; userId: string }
  | { type: "submission"; submission: SubmissionPayload; userId: string }
  | { type: "vote"; submissionId: string; userId: string }
  | { type: "chat"; text: string; userId: string; name: string };

export function useRealtimeRoom(
  roomId: string,
  user: PresenceUser | null,
  onMessage: (msg: RoomMessage) => void
) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const [connected, setConnected] = useState(false);
  const [present, setPresent] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!hasRealtime || !supabase || !user) return;

    const channel = supabase.channel(`battle:${roomId}`, {
      config: { presence: { key: user.userId } },
    });
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "msg" }, ({ payload }) => {
        onMessageRef.current(payload as RoomMessage);
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceUser>();
        const users: PresenceUser[] = Object.values(state).flat();
        setPresent(users);
      })
      .subscribe(async (status, err) => {
        console.log("CHANNEL STATUS:", status, err);
        if (status === "SUBSCRIBED") {
          setConnected(true);
          await channel.track(user);
        } else {
          setConnected(false);
        }
      });

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;
      setConnected(false);
    };
  }, [roomId, user?.userId]);

  const send = useCallback((msg: RoomMessage) => {
    channelRef.current?.send({ type: "broadcast", event: "msg", payload: msg });
  }, []);

  return { send, present, connected };
}

export function useRemoteStrokes(
  incoming: RoomMessage | null,
  myUserId: string
) {
  const [remote, setRemote] = useState<Stroke[]>([]);
  const liveRef = useRef<{ [userId: string]: Stroke }>({});

  useEffect(() => {
    if (!incoming) return;

    if (incoming.type === "stroke-point" && incoming.userId !== myUserId) {
      const s = liveRef.current[incoming.userId];
      if (s) s.points.push({ x: incoming.x, y: incoming.y });
      return;
    }

    if (incoming.type === "stroke-start" && incoming.userId !== myUserId) {
      liveRef.current[incoming.userId] = incoming.stroke;
      return;
    }

    if (incoming.type === "stroke-commit" && incoming.userId !== myUserId) {
      delete liveRef.current[incoming.userId];
      setRemote((prev) => [...prev, incoming.stroke]);
      return;
    }

    if (incoming.type === "clear") {
      liveRef.current = {};
      setRemote([]);
    }
  }, [incoming, myUserId]);

  return { remote, liveRef };
}