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
         ここでエントリを分ける。出力は dist/lp/women.html · dist/lp/men.html。
         Vercel では /lp/women · /lp/men で開ける（vercel.json の rewrites）。 */
      input: {
        main: resolve(ROOT, "index.html"),
        lpWomen: resolve(ROOT, "lp/women.html"),
        lpMen: resolve(ROOT, "lp/men.html"),
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
