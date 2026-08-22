/* 広告用ランディングページ（募集する側／おごられる側）の入口。
   アプリ本体とは別のページなので、Service Worker は登録しない。
   ここで読み込むのは React とこのページだけ（supabase は入れない）。 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import WomenPage from "./WomenPage.jsx";
import "../index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <WomenPage />
  </StrictMode>
);
