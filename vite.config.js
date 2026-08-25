import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      /* ページは3つ。アプリ本体（index.html）と、広告用のLP2枚。
         LP はアプリのバンドル（supabase・認証）を読み込まない別ページなので、
         ここでエントリを分ける。出力は dist/lp/host.html · dist/lp/guest.html。
         Vercel では /lp/host · /lp/guest で開ける（vercel.json の rewrites）。

         ⚠ ファイル名は「募集する側（host）／参加する側（guest）」で付ける。
           広告の宛先は分けているが、URL も含めてページ上に性別を出さない
           （HANDOFF.md §10 の文言の約束と揃える）。
           旧 URL（/lp/women · /lp/men）は vercel.json の redirects で
           恒久リダイレクトしてある。 */
      input: {
        main: resolve(ROOT, "index.html"),
        lpHost: resolve(ROOT, "lp/host.html"),
        lpGuest: resolve(ROOT, "lp/guest.html"),
      },
      output: {
        // 依存ライブラリはアプリ本体と分けておく。
        // アプリ側を直すたびに React や Supabase まで再ダウンロードさせない。
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler")) return "react";
          if (id.includes("lucide-react")) return "icons";
          return "vendor";
        },
      },
    },
    // 分割後の各チャンクは 500kB を大きく下回るため、警告の閾値を実態に合わせる
    chunkSizeWarningLimit: 600,
  },
});
