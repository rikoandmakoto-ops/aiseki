import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // 依存ライブラリはアプリ本体と分けておく。
    // アプリ側を直すたびに React や Supabase まで再ダウンロードさせない。
    rollupOptions: {
      output: {
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
