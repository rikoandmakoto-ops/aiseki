/* 広告用ランディングページ（参加する側／相席する側）の入口。
   アプリ本体とは別のページなので、Service Worker は登録しない。
   ここで読み込むのは React とこのページだけ（supabase は入れない）。 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MenPage from "./MenPage.jsx";
import "../index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <MenPage />
  </StrictMode>
);
