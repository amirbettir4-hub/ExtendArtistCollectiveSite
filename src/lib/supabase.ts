import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const hasRealtime = Boolean(url && key);

export const supabase = hasRealtime
  ? createClient(url!, key!, {
      realtime: { params: { eventsPerSecond: 20 } },
    })
  : null;