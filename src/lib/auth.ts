import { supabase } from "./supabase";
import type { User } from "../store";

/** Send a magic link to the given email. */
export async function signInWithMagicLink(email: string) {
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw error;
}

/** Sign the current user out. */
export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/** Subscribe to auth state changes. Returns an unsubscribe function. */
export function onAuthChange(callback: (user: User | null) => void) {
  if (!supabase) {
    callback(null);
    return () => {};
  }

  /* emit current session immediately */
  supabase.auth.getSession().then(({ data }) => {
    callback(mapUser(data.session?.user ?? null));
  });

  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(mapUser(session?.user ?? null));
  });

  return () => sub.subscription.unsubscribe();
}

function mapUser(
  u: { email?: string | null; user_metadata?: Record<string, unknown> } | null
): User | null {
  if (!u || !u.email) return null;
  const name =
    (u.user_metadata?.name as string | undefined) || u.email.split("@")[0];
  return { email: u.email, name };
}