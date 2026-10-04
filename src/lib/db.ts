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
  if (error || !data) return [];
  return data.map(rowToSubmission);
}

async function uploadArenaArt(dataUrl: string, submissionId: string): Promise<string | null> {
  if (!supabase) return null;
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${submissionId}.png`;
  const { error } = await supabase.storage
    .from("arena-art")
    .upload(path, blob, { contentType: "image/png", upsert: true });
  if (error) return null;
  return supabase.storage.from("arena-art").getPublicUrl(path).data.publicUrl;
}

export async function saveSubmission(sub: Submission): Promise<boolean> {
  if (!supabase) return false;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return false;

  const url = await uploadArenaArt(sub.image, sub.id);
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
  return !error;
}

export async function castVote(submissionId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return false;

  const { error } = await supabase.from("votes").insert({
    submission_id: submissionId,
    user_id: userId,
  });
  if (error && error.code !== "23505") return false;
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
  if (error || !data) return [];
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

export async function savePost(post: Post, imageDataUrl?: string): Promise<boolean> {
  if (!supabase) return false;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return false;

  let imageUrl = post.image;

  if (imageDataUrl && imageDataUrl.startsWith("data:")) {
    const blob = await (await fetch(imageDataUrl)).blob();
    const path = `${post.id}.png`;
    const { error: upErr } = await supabase.storage
      .from("studio-art")
      .upload(path, blob, { contentType: "image/png", upsert: true });
    if (upErr) return false;
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
  return !error;
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
  return !error;
}

export async function loadInquiriesForArtist(artistName: string): Promise<Inquiry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("inquiries")
    .select("*")
    .eq("artist_name", artistName)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
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
   ARTWORKS
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
  if (error || !data) return [];
  return data.map(rowToArtwork);
}

export async function loadArtworksByUser(userId: string): Promise<Artwork[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("artworks")
    .select("*")
    .eq("artist_id", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map(rowToArtwork);
}

export async function saveArtwork(
  art: Omit<Artwork, "id" | "artistId" | "createdAt">,
  imageDataUrl: string
): Promise<Artwork | null> {
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;

  const id = crypto.randomUUID();
  const blob = await (await fetch(imageDataUrl)).blob();
  const path = `${id}.png`;
  const { error: upErr } = await supabase.storage
    .from("wall-art")
    .upload(path, blob, { contentType: "image/png", upsert: false });
  if (upErr) return null;
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

  if (error || !data) return null;
  return rowToArtwork(data);
}

export async function deleteArtwork(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("artworks").delete().eq("id", id);
  return !error;
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

/* =========================================================
   ARTISTS
========================================================= */

export type Artist = {
  id: string;
  userId: string;
  name: string;
  location: string;
  medium: string;
  bio: string;
  website: string;
  avatar: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
};

type ArtistRow = {
  id: string;
  user_id: string;
  name: string;
  location: string | null;
  medium: string | null;
  bio: string | null;
  website: string | null;
  avatar_url: string | null;
  status: string;
  created_at: string;
};

export async function loadArtists(): Promise<Artist[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("artists")
    .select("*")
    .eq("status", "approved")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map(rowToArtist);
}

export async function loadArtistById(id: string): Promise<Artist | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("artists")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return rowToArtist(data);
}

export async function loadMyArtist(userId: string): Promise<Artist | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("artists")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return rowToArtist(data);
}

export async function saveArtistProfile(
  userId: string,
  profile: Omit<Artist, "id" | "userId" | "status" | "createdAt">,
  avatarDataUrl: string | null
): Promise<Artist | null> {
  if (!supabase) return null;

  let avatarUrl = profile.avatar;

  if (avatarDataUrl && avatarDataUrl.startsWith("data:")) {
    const blob = await (await fetch(avatarDataUrl)).blob();
    const path = `${userId}-avatar.png`;
    const { error: upErr } = await supabase.storage
      .from("artist-avatars")
      .upload(path, blob, { contentType: "image/png", upsert: true });
    if (!upErr) {
      avatarUrl = supabase.storage.from("artist-avatars").getPublicUrl(path).data.publicUrl;
    }
  }

  const existing = await loadMyArtist(userId);

  if (existing) {
    const { data, error } = await supabase
      .from("artists")
      .update({
        name: profile.name,
        location: profile.location,
        medium: profile.medium,
        bio: profile.bio,
        website: profile.website,
        avatar_url: avatarUrl,
      })
      .eq("user_id", userId)
      .select()
      .single();
    if (error || !data) return null;
    return rowToArtist(data);
  }

  const { data, error } = await supabase
    .from("artists")
    .insert({
      user_id: userId,
      name: profile.name,
      location: profile.location,
      medium: profile.medium,
      bio: profile.bio,
      website: profile.website,
      avatar_url: avatarUrl,
      status: "pending",
    })
    .select()
    .single();
  if (error || !data) return null;
  return rowToArtist(data);
}

export async function loadPendingArtists(): Promise<Artist[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("artists")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map(rowToArtist);
}

export async function setArtistStatus(
  id: string,
  status: "approved" | "rejected"
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from("artists")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  return !error;
}

function rowToArtist(row: ArtistRow): Artist {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    location: row.location ?? "",
    medium: row.medium ?? "",
    bio: row.bio ?? "",
    website: row.website ?? "",
    avatar: row.avatar_url ?? "",
    status: (row.status as Artist["status"]) ?? "pending",
    createdAt: new Date(row.created_at).getTime(),
  };
}