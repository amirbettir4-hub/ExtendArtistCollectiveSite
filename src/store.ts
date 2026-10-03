import { useEffect, useState } from "react";

/* Persisted state that survives reload */
export function usePersisted<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota or private mode — ignore */
    }
  }, [key, value]);

  return [value, setValue] as const;
}

/* Shared types */
export type Stroke = {
  points: { x: number; y: number }[];
  color: string;
  size: number;
  mode: "brush" | "eraser";
};

export type Submission = {
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

export type Post = {
  id: string;
  artist: string;
  handle: string;
  avatar: string;
  image: string;
  status: "WIP" | "Finished";
  medium: string;
  caption: string;
  time: string;
  createdAt: number;
};

export type Inquiry = {
  id: string;
  workId: number;
  workTitle: string;
  name: string;
  email: string;
  message: string;
  createdAt: number;
};

export type User = { name: string; email: string };

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
