import { supabase } from "./supabase";
import type { Stroke, Submission, Post } from "../store";

/* =========================================================
   SUBMISSIONS
========================================================= */

type Row = {
  id: string;
  battle_id: number;
  artist_id: string | null;
  artist_name: string;
  artist_avatar: string | null;
  image_url: string;
  strokes: Stroke[] | null;
  prompt: string;
  votes: number;
  created_at: string;
};

export async function loadSubmissions(battleId: number): Promise<Submission[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("battle_id", battleId)
    .order("created_at", { ascending: true });
  if (error || !data) {
    console.error("loadSubmissions:", error);
    return [];
  }
  return data.map(rowToSubmission);
}

async function uploadArtwork(dataUrl: string, submissionId: string): Promise<string | null> {
  if (!supabase) return null;
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${submissionId}.png`;
  const { error } = await supabase.storage
    .from("arena-art")
    .upload(path, blob, { contentType: "image/png", upsert: true });
  if (error) {
    console.error("uploadArtwork:", error);
    return null;
  }
  const { data } = supabase.storage.from("arena-art").getPublicUrl(path);
  return data.publicUrl;
}

export async function saveSubmission(sub: Submission): Promise<boolean> {
  if (!supabase) return false;

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    console.warn("saveSubmission: not signed in");
    return false;
  }

  const url = await uploadArtwork(sub.image, sub.id);
  if (!url) return false;

  const { error } = await supabase.from("submissions").insert({
    id: sub.id,
    battle_id: sub.battleId,
    artist_id: userId,
    artist_name: sub.artistName,
    artist_avatar: sub.artistAvatar,
    image_url: url,
    strokes: sub.strokes,
    prompt: sub.prompt,
  });
  if (error) {
    console.error("saveSubmission:", error);
    return false;
  }
  return true;
}

export async function castVote(submissionId: string): Promise<boolean> {
  if (!supabase) return false;

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    console.warn("castVote: not signed in");
    return false;
  }

  const { error } = await supabase.from("votes").insert({
    submission_id: submissionId,
    user_id: userId,
  });

  if (error && error.code !== "23505") {
    console.error("castVote:", error);
    return false;
  }
  return true;
}

function rowToSubmission(row: Row): Submission {
  return {
    id: row.id,
    battleId: row.battle_id,
    artistName: row.artist_name,
    artistAvatar: row.artist_avatar ?? "",
    image: row.image_url,
    strokes: row.strokes,
    prompt: row.prompt,
    votes: row.votes,
    createdAt: new Date(row.created_at).getTime(),
  };
}

/* =========================================================
   STUDIO POSTS
========================================================= */

type PostRow = {
  id: string;
  user_id: string | null;
  artist_name: string;
  handle: string | null;
  avatar_url: string | null;
  image_url: string;
  status: string;
  medium: string;
  caption: string;
  created_at: string;
};

export async function loadPosts(): Promise<Post[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) {
    console.error("loadPosts:", error);
    return [];
  }
  return data.map((row: PostRow) => ({
    id: row.id,
    artist: row.artist_name,
    handle: row.handle ?? "",
    avatar: row.avatar_url ?? "",
    image: row.image_url,
    status: row.status === "WIP" ? "WIP" : "Finished",
    medium: row.medium,
    caption: row.caption,
    time: formatTime(row.created_at),
    createdAt: new Date(row.created_at).getTime(),
  }));
}

export async function savePost(
  post: Post,
  imageDataUrl?: string
): Promise<boolean> {
  if (!supabase) return false;

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    console.warn("savePost: not signed in");
    return false;
  }

  let imageUrl = post.image;

  if (imageDataUrl && imageDataUrl.startsWith("data:")) {
    const blob = await (await fetch(imageDataUrl)).blob();
    const path = `${post.id}.png`;
    const { error: uploadErr } = await supabase.storage
      .from("studio-art")
      .upload(path, blob, { contentType: "image/png", upsert: true });
    if (uploadErr) {
      console.error("savePost upload:", uploadErr);
      return false;
    }
    imageUrl = supabase.storage.from("studio-art").getPublicUrl(path).data.publicUrl;
  }

  const { error } = await supabase.from("posts").insert({
    id: post.id,
    user_id: userId,
    artist_name: post.artist,
    handle: post.handle,
    avatar_url: post.avatar,
    image_url: imageUrl,
    status: post.status,
    medium: post.medium,
    caption: post.caption,
  });
  if (error) {
    console.error("savePost:", error);
    return false;
  }
  return true;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}