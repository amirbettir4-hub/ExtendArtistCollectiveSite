import { supabase } from "./supabase";
import type { Stroke, Submission } from "../store";

type Row = {
  id: string;
  battle_id: number;
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
  return data.map((row: Row) => ({
    id: row.id,
    battleId: row.battle_id,
    artistName: row.artist_name,
    artistAvatar: row.artist_avatar ?? "",
    image: row.image_url,
    strokes: row.strokes,
    prompt: row.prompt,
    votes: row.votes,
    createdAt: new Date(row.created_at).getTime(),
  }));
}

export async function saveSubmission(sub: Submission) {
  if (!supabase) return;
  const { error } = await supabase.from("submissions").insert({
    id: sub.id,
    battle_id: sub.battleId,
    artist_name: sub.artistName,
    artist_avatar: sub.artistAvatar,
    image_url: sub.image,
    strokes: sub.strokes,
    prompt: sub.prompt,
    votes: 0,
  });
  if (error) console.error("saveSubmission:", error);
}

export async function incrementVote(submissionId: string) {
  if (!supabase) return;
  const { data, error } = await supabase
    .from("submissions")
    .select("votes")
    .eq("id", submissionId)
    .single();
  if (error || !data) return;
  await supabase
    .from("submissions")
    .update({ votes: (data.votes ?? 0) + 1 })
    .eq("id", submissionId);
}