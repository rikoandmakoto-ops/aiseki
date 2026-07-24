import { createClient } from "@supabase/supabase-js";

// Publishable (anon) key — 公開して問題ない鍵。env が無い環境でも動くようフォールバックを用意。
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://tvydtsqirogdxglkoicz.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_2mA7W9xs1RH50b4EKhBKmg_F-mQ-ipX";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
