import { createClient } from "@supabase/supabase-js";

/* =====================================================================
   Supabase クライアント

   接続情報は必ず環境変数から読む。
   ・ローカル … プロジェクト直下の .env
   ・本番     … Vercel の環境変数（VITE_ プレフィックスが必須）

   以前はここに URL と publishable key をハードコードしたフォールバックを
   置いていたが、参照先のプロジェクトが消えた際に
   「環境変数の設定漏れ」と「バックエンドの不通」を区別できず、
   画面には Failed to fetch としか出なかった。
   フォールバックは持たず、未設定なら configError で明示する。
   ===================================================================== */
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

// 未設定なら画面に出す文言。null なら設定済み。
export const configError =
  !SUPABASE_URL || !SUPABASE_ANON_KEY
    ? "接続先が設定されていません（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）。"
    : null;

if (configError) {
  // ビルドは通るが動かない状態なので、コンソールにも必ず残す。
  console.error("[aiseki] Supabase 未設定:", configError);
}

// 未設定でも createClient が throw して真っ白にならないよう、形だけのURLを渡す。
// 実際の通信は configError の画面で止めるため発生しない。
export const supabase = createClient(
  SUPABASE_URL || "https://unconfigured.invalid",
  SUPABASE_ANON_KEY || "unconfigured",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
