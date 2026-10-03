import { supabase } from "./supabase";
import type { Stroke, Submission, Post, Inquiry } from "../store";

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

/* =========================================================
   INQUIRIES
========================================================= */

type InquiryRow = {
  id: string;
  artwork_id: number;
  work_title: string;
  artist_name: string;
  buyer_id: string | null;
  buyer_name: string;
  buyer_email: string;
  message: string;
  read: boolean;
  created_at: string;
};

export async function saveInquiry(
  workId: number,
  workTitle: string,
  artistName: string,
  buyerName: string,
  buyerEmail: string,
  message: string
): Promise<boolean> {
  if (!supabase) return false;

  const { data: userData } = await supabase.auth.getUser();
  const buyerId = userData.user?.id ?? null;

  const { error } = await supabase.from("inquiries").insert({
    artwork_id: workId,
    work_title: workTitle,
    artist_name: artistName,
    buyer_id: buyerId,
    buyer_name: buyerName,
    buyer_email: buyerEmail,
    message,
  });

  if (error) {
    console.error("saveInquiry:", error);
    return false;
  }
  return true;
}

export async function loadInquiriesForArtist(artistName: string): Promise<Inquiry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("inquiries")
    .select("*")
    .eq("artist_name", artistName)
    .order("created_at", { ascending: false });
  if (error || !data) {
    console.error("loadInquiriesForArtist:", error);
    return [];
  }
  return data.map((row: InquiryRow) => ({
    id: row.id,
    workId: row.artwork_id,
    workTitle: row.work_title,
    artistName: row.artist_name,
    buyerName: row.buyer_name,
    buyerEmail: row.buyer_email,
    message: row.message,
    read: row.read,
    createdAt: new Date(row.created_at).getTime(),
  }));
}

/* =========================================================
   ARTWORKS (The Wall)
========================================================= */

export type Artwork = {
  id: string;
  artistId: string | null;
  artistName: string;
  title: string;
  image: string;
  medium: string;
  dimensions: string;
  year: number;
  price: number;
  available: boolean;
  createdAt: number;
};

type ArtworkRow = {
  id: string;
  artist_id: string | null;
  artist_name: string;
  title: string;
  image_url: string;
  medium: string;
  dimensions: string | null;
  year: number | null;
  price: number;
  available: boolean;
  created_at: string;
};

export async function loadArtworks(): Promise<Artwork[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("artworks")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) {
    console.error("loadArtworks:", error);
    return [];
  }
  return data.map(rowToArtwork);
}

export async function saveArtwork(
  art: Omit<Artwork, "id" | "artistId" | "createdAt">,
  imageDataUrl: string
): Promise<Artwork | null> {
  if (!supabase) return null;

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    console.warn("saveArtwork: not signed in");
    return null;
  }

  const id = crypto.randomUUID();
  const blob = await (await fetch(imageDataUrl)).blob();
  const path = `${id}.png`;
  const { error: upErr } = await supabase.storage
    .from("wall-art")
    .upload(path, blob, { contentType: "image/png", upsert: false });
  if (upErr) {
    console.error("saveArtwork upload:", upErr);
    return null;
  }
  const imageUrl = supabase.storage.from("wall-art").getPublicUrl(path).data.publicUrl;

  const { data, error } = await supabase
    .from("artworks")
    .insert({
      id,
      artist_id: userId,
      artist_name: art.artistName,
      title: art.title,
      image_url: imageUrl,
      medium: art.medium,
      dimensions: art.dimensions,
      year: art.year,
      price: art.price,
      available: art.available,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("saveArtwork insert:", error);
    return null;
  }
  return rowToArtwork(data);
}

function rowToArtwork(row: ArtworkRow): Artwork {
  return {
    id: row.id,
    artistId: row.artist_id,
    artistName: row.artist_name,
    title: row.title,
    image: row.image_url,
    medium: row.medium,
    dimensions: row.dimensions ?? "",
    year: row.year ?? new Date().getFullYear(),
    price: row.price,
    available: row.available,
    createdAt: new Date(row.created_at).getTime(),
  };
}