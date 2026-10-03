import { supabase } from "./supabase";
import type { Stroke, Submission } from "../store";

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

/** Upload a base64 PNG to Supabase Storage and return the public URL. */
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

/** Cast a vote — unique per user, atomic via SQL trigger. */
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

  /* duplicate vote (23505 = unique violation) — just ignore */
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