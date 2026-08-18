import { supabase } from "./supabase";

/* =====================================================================
   相席（グループ飲み会）の共通ルール
   ・1つの会は「ホスト側2名以上」×「参加側2名以上」でのみ成立する（1対1は不可）
   ・相席はオープンスペースのみ。個室での相席は提供しない
     （出会い系喫茶に該当するリスクを避けるため）
   ・20歳以上限定（飲酒を伴うため）
   ・個人プロフィールは同じ会に参加承認された相手にのみ公開（RLSで担保）
   ※ いずれも DB 側（制約・トリガー）でも二重に強制している。
   ===================================================================== */
export const MIN_GROUP_SIZE = 2;

/* ===================== 料金（一律・変更不可） =====================
   ・募集する側（ホスト）は無料。会はいくつでも自由に立てられる。
   ・参加する側は 1人あたり一律 3,800pt。会ごとの金額設定は無い。
   ・支払われたポイントは全額が運営の収益で、ホストへの報酬は無い。
   ・そのかわり、当日のホストグループの飲食代は参加グループが負担する。
   ここを変えるときは supabase の join_fee_per_person() も必ず合わせること
   （DB 側の CHECK 制約とトリガーが同じ値を強制している）。
   ================================================================= */
export const JOIN_FEE_PER_PERSON = 3800;

/* お会計の区分。ホストは必ずおごられるため、これ以外は保存できない。 */
export const TREAT_TYPE_GUEST_TREATS = "ゲストのおごり";

/* 参加グループが支払う合計ポイント */
export const joinFeeFor = (groupSize) =>
  JOIN_FEE_PER_PERSON * Math.max(0, Number(groupSize) || 0);

/* 席の種別。個室は業態上そもそも選択できない（オープンスペースのみ）。 */
export const ROOM_TYPE_OPEN = "open";
export const ROOM_TYPES = [
  {
    key: ROOM_TYPE_OPEN,
    label: "オープンスペース",
    note: "フロア席・カウンター等、店内を見渡せる席",
    allowed: true,
  },
  {
    key: "private",
    label: "個室・半個室",
    note: "出会い系喫茶に該当するおそれがあるため提供しません",
    allowed: false,
  },
];

/* ===================== 入力値の検証（共通） =====================
   画面から入る値の上限をここに集約する。DB 側でも
   migration_launch.sql の CHECK 制約で同じ上限を強制しており、
   画面を迂回して API を直接叩かれても保存されない。
   ============================================================== */
export const LIMITS = {
  username: 20,
  bio: 500,
  title: 60,
  location: 60,
  message: 2000,
  inquiry: 4000,
  inquirySubject: 120,
};

export function isValidEmail(v) {
  const s = String(v || "").trim();
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/* プロフィール写真の保存先（Supabase Storage）のオリジン。
   接続先が未設定のときは null（その場合は https のみを要求する）。 */
const STORAGE_ORIGIN = (() => {
  try {
    return new URL(String(import.meta.env.VITE_SUPABASE_URL || "")).origin;
  } catch {
    return null;
  }
})();

/* 画像URLとして安全に <img src> に渡せる値だけを通す。

   ・javascript: / data: を弾く
   ・保存先は自前のストレージだけに限る

   外部URLを許すと、そのURLを設定した本人が
   「会のメンバーが詳細画面を開いた時刻とIPアドレス」を
   自分のサーバのアクセスログから取れてしまう。
   写真はアップロード方式に統一したので、外部URLは受け付けない。 */
export function safeImageUrl(value) {
  const s = String(value || "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return null;
    if (STORAGE_ORIGIN && u.origin !== STORAGE_ORIGIN) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/* 前後の空白を落として上限で切る。空文字は null にする。 */
export function trimTo(value, max) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/* migration_launch.sql が未適用のときに分かりやすいエラーへ変換する */
function wrapLaunchError(error) {
  const msg = error?.message || "";
  if (/inquiries|cancel_party|delete_account|does not exist|schema cache/i.test(msg)) {
    return new Error(
      "この機能に必要なデータベースの更新がまだ適用されていません。" +
      "Supabase の SQL Editor で supabase/migration_launch.sql を実行してください。"
    );
  }
  return error;
}

// マイグレーション未適用（新カラム・新RPCが無い）場合に分かりやすいエラーへ変換する
function wrapSchemaError(error) {
  const msg = error?.message || "";
  if (/host_member_names|member_names|group_owner_id|display_name|invite_code|claim_seat|list_my_seats|side/.test(msg)) {
    return new Error(
      "データベースがグループメンバー登録の仕様に更新されていません。" +
      "Supabase の SQL Editor で supabase/migration_group_members.sql を実行してください。"
    );
  }
  if (/room_type|birth_date|age_verified_at/.test(msg)) {
    return new Error(
      "データベースが年齢確認・個室禁止の仕様に更新されていません。" +
      "Supabase の SQL Editor で supabase/migration_age20_open_space.sql を実行してください。"
    );
  }
  if (/group_size|host_group_size|guest_group_size|applicant_name|host_name/.test(msg)) {
    return new Error(
      "データベースがグループ限定仕様に更新されていません。" +
      "Supabase の SQL Editor で supabase/migration_group_only.sql を実行してください。"
    );
  }
  return error;
}

/* 同伴者の表示名を「代表者を除く size-1 件」に整える。
   空欄は既定名で埋める（サーバ側でも同じ正規化を行う）。 */
export function normalizeMemberNames(names, groupSize) {
  const out = [];
  for (let i = 0; i < Math.max(Number(groupSize) - 1, 0); i++) {
    const v = String(names?.[i] ?? "").trim();
    out.push(v ? v.slice(0, 20) : `メンバー${i + 2}`);
  }
  return out;
}

/* ============================ Auth ============================ */
/* 20歳未満は利用禁止（飲酒を伴う業態のため）。
   性別は登録時に一切収集しない（性別による制限を設けないため）。 */
export const MIN_AGE = 20;

/* 生年月日（YYYY-MM-DD）から満年齢を計算する。不正な値なら null。 */
export function ageFromBirthDate(birthDate) {
  if (!birthDate) return null;
  const d = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  if (d > now) return null;
  let age = now.getFullYear() - d.getFullYear();
  const before =
    now.getMonth() < d.getMonth() ||
    (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (before) age -= 1;
  return age;
}

/* 20歳以上かどうか（年齢確認の判定はここに集約する） */
export function isLegalAge(birthDate) {
  const age = ageFromBirthDate(birthDate);
  return age !== null && age >= MIN_AGE;
}

/* 生年月日の入力欄で選択できる上限日（今日からちょうど MIN_AGE 年前）。
   toISOString() は UTC に変換されて1日ずれることがあるため、
   ローカル日付から組み立てる（今日が誕生日の方をちょうど選べるようにする）。 */
export function maxBirthDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - MIN_AGE);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* 新規登録。生年月日による年齢確認（20歳以上）と、
   規約・年齢の同意チェックを通過しないと登録できない。
   年齢は生年月日から算出した値のみを保存する（自己申告の数値は受け取らない）。 */
export async function signUp({ email, password, username, birthDate, ageConfirmed }) {
  if (!ageConfirmed) {
    throw new Error(`${MIN_AGE}歳以上であることの確認と、利用規約への同意が必要です。`);
  }
  const age = ageFromBirthDate(birthDate);
  if (age === null) {
    throw new Error("生年月日を正しく入力してください。");
  }
  if (age < MIN_AGE) {
    throw new Error(`本サービスは${MIN_AGE}歳未満の方はご利用いただけません。`);
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        birth_date: birthDate,
        age: String(age),
        age_confirmed: true,
      },
    },
  });
  if (error) throw error;
  return data;
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/* パスワード再設定メールの送信。
   リンクを開くと ?type=recovery でこのアプリに戻り、
   supabase-js が復旧用セッションを張る（detectSessionInUrl: true）。
   その状態で updatePassword() を呼ぶと新しいパスワードが設定される。 */
export async function sendPasswordReset(email) {
  const addr = String(email || "").trim();
  if (!isValidEmail(addr)) throw new Error("メールアドレスを正しく入力してください。");
  const redirectTo =
    typeof window === "undefined" ? undefined : `${window.location.origin}/?type=recovery`;
  const { error } = await supabase.auth.resetPasswordForEmail(addr, { redirectTo });
  if (error) throw error;
}

/* 復旧セッション中に新しいパスワードを設定する */
export async function updatePassword(password) {
  if (String(password || "").length < 8) {
    throw new Error("パスワードは8文字以上で入力してください。");
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/* 退会（利用規約 第15条）。
   auth.users の行を消すと、プロフィール・ポイント・会・メッセージが
   すべて cascade で削除される（migration_launch.sql の delete_account）。 */
export async function deleteAccount() {
  const { error } = await supabase.rpc("delete_account");
  if (error) throw wrapLaunchError(error);
  await supabase.auth.signOut().catch(() => {});
}

/* ========================== Profile ==========================
   生年月日（birth_date）と年齢確認日時（age_verified_at）は、
   本人にも返さない（DB 側で列単位に SELECT を遮断している）。
   そのため列は明示的に指定する（"*" は権限エラーになる）。 */
const PROFILE_COLUMNS = "id, username, avatar_url, age, bio, created_at";

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// プロフィール更新。年齢は 20歳未満に書き換えられない（DB 側の制約でも拒否される）。
// 生年月日は年齢確認の根拠のため、ここからは変更できない。
// 文字数・画像URLのスキームはここで正規化してから送る。
export async function updateProfile(userId, fields) {
  const { birth_date, age, username, bio, avatar_url, ...rest } = fields;

  const patch = { ...rest };

  if (age !== undefined) {
    if (age === null || age === "") {
      patch.age = null;
    } else {
      const n = Number(age);
      if (!Number.isFinite(n) || n < MIN_AGE) {
        throw new Error(`本サービスは${MIN_AGE}歳未満の方はご利用いただけません。`);
      }
      if (n > 120) throw new Error("年齢を正しく入力してください。");
      patch.age = Math.floor(n);
    }
  }

  if (username !== undefined) patch.username = trimTo(username, LIMITS.username);
  if (bio !== undefined) patch.bio = trimTo(bio, LIMITS.bio);

  if (avatar_url !== undefined) {
    if (!avatar_url) {
      patch.avatar_url = null;
    } else {
      const safe = safeImageUrl(avatar_url);
      if (!safe) {
        throw new Error("写真は、アプリからアップロードした画像のみ設定できます。");
      }
      patch.avatar_url = safe;
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw wrapSchemaError(error);
  return data;
}

/* ====================== プロフィール写真 ======================
   avatars バケット（migration_launch.sql で作成）へ直接上げる。
   保存先は「<自分のユーザーID>/<乱数>.<拡張子>」で固定する。
   ストレージ側のポリシーが先頭フォルダ名と auth.uid() の一致を要求
   するため、他人のフォルダには書き込めない。
   ============================================================== */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;      // 2MB（バケット側の上限と一致させる）
export const AVATAR_MIME = ["image/jpeg", "image/png", "image/webp"];

export async function uploadAvatar(userId, file) {
  if (!file) throw new Error("画像を選択してください。");
  if (!AVATAR_MIME.includes(file.type)) {
    throw new Error("画像は JPEG・PNG・WebP のいずれかを選択してください。");
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new Error("画像のサイズが大きすぎます（2MBまで）。");
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  // ファイル名は推測できない値にする（公開バケットのため）
  const rand = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
  const path = `${userId}/${rand}.${ext}`;

  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });

  if (error) {
    if (/bucket not found/i.test(error.message || "")) {
      throw new Error(
        "写真の保存先（avatars バケット）がまだ作られていません。" +
        "Supabase の SQL Editor で supabase/migration_launch.sql を実行してください。"
      );
    }
    if (/exceeded the maximum allowed size|payload too large/i.test(error.message || "")) {
      throw new Error("画像のサイズが大きすぎます（2MBまで）。");
    }
    throw error;
  }

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = safeImageUrl(data?.publicUrl);
  if (!url) throw new Error("写真のURLを取得できませんでした。");
  return url;
}

/* 古い写真を消す（新しい写真に差し替えたとき）。失敗しても致命的ではない。 */
export async function removeAvatar(userId, url) {
  const marker = "/storage/v1/object/public/avatars/";
  const i = String(url || "").indexOf(marker);
  if (i === -1) return;
  const path = decodeURIComponent(String(url).slice(i + marker.length).split("?")[0]);
  // 自分のフォルダ以外は触らない
  if (!path.startsWith(`${userId}/`)) return;
  await supabase.storage.from("avatars").remove([path]).catch(() => {});
}

/* ========================== Points =========================== */
export async function getBalance(userId) {
  const { data, error } = await supabase
    .from("point_balances")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.balance ?? 0;
}

export async function getPointHistory(userId) {
  const { data, error } = await supabase
    .from("points")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

/* ポイント購入 … Stripe Checkout のページを作り、その URL を返す。

   ポイントを増やす RPC（purchase_points）は service_role 専用にしてあり、
   アプリからは呼べない。付与は支払い完了の通知を受けた
   /api/stripe/webhook だけが行う（ポイントの無限増殖を防ぐため）。 */
export async function createCheckoutSession(packId) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("ログインが必要です。");

  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ packId }),
  });

  // vite dev（npm run dev）には /api が無く、HTML が返ってくる。
  // JSON でない時点で「決済APIに届いていない」と分かる。
  if (!res.headers.get("content-type")?.includes("application/json")) {
    throw new Error(
      "決済APIに接続できませんでした。ローカルでは `vercel dev` で起動してください。"
    );
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.url) throw new Error(body?.error || "決済ページを開けませんでした。");
  return body.url;
}

// ポイント変換（自分の残高から減算）。
export async function convertPoints(amount, description) {
  const { data, error } = await supabase.rpc("convert_points", {
    p_amount: amount,
    p_description: description,
  });
  if (error) throw error;
  return data; // 新しい残高
}

/* ========================== Parties ========================== */
// 一覧・詳細では会の情報（場所・時間・人数・ポイント）と
// ホストのニックネーム（parties.host_name）だけを取得する。
// 参加者個人のプロフィールは join せず、承認後に getPartyMembers() でのみ取得する。
export async function listParties(area) {
  let q = supabase
    .from("parties")
    .select("*")
    .eq("status", "recruiting")
    .order("created_at", { ascending: false });
  if (area) q = q.eq("area", area);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getParty(id) {
  const { data, error } = await supabase
    .from("parties")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

// 参加メンバーの「席」一覧。RLS により、その会に参加承認された本人のみ取得できる
//（未承認・非参加者には空配列が返る）。
// グループの人数分だけ席が存在し、まだアプリに登録していない同伴者の席は
// user_id が null（＝profiles も null）で返る。
/* profiles の埋め込みは、外部キーの名前を明示して指定する。
   party_members.user_id → profiles.id の外部キーが（過去のマイグレーションの
   名残で）二重に張られている環境があり、`profiles(...)` とだけ書くと
   PostgREST が「関係を特定できない」（PGRST201）で失敗する。
   重複そのものは migration_launch.sql で解消するが、
   未適用の環境でも動くよう、こちら側でも関係を一意に指定しておく。 */
const MEMBER_PROFILE = "profiles!party_members_user_id_fkey(username, avatar_url, age)";

export async function getPartyMembers(partyId) {
  const { data, error } = await supabase
    .from("party_members")
    .select(`id, role, side, group_owner_id, display_name, joined_at, user_id, ${MEMBER_PROFILE}`)
    .eq("party_id", partyId)
    .order("joined_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw wrapSchemaError(error);
  return data ?? [];
}

// 自分のグループの席だけを招待コード付きで取得する（他グループのコードは見えない）。
export async function listMySeats(partyId) {
  const { data, error } = await supabase.rpc("list_my_seats", { p_party: partyId });
  if (error) throw wrapSchemaError(error);
  return data ?? [];
}

// 招待コードで同伴者の席を自分のアカウントに引き受ける。
// 席は既に人数に含まれているため、会の人数は変わらない。
export async function claimSeat(code) {
  const { data, error } = await supabase.rpc("claim_seat", { p_code: String(code || "").trim() });
  if (error) throw wrapSchemaError(error);
  return data; // { party_id, title }
}

// 会の作成。募集は無料で、いくつでも自由に立てられる。
//  ・ホスト側・参加側ともに2名以上のグループが必須（1対1は作成不可）
//  ・席の種別はオープンスペース固定（個室での相席は作成できない）
//  ・参加ポイントは 1人あたり一律 3,800pt 固定。ホストは金額を設定できない
//  ・お会計は「ゲストのおごり」固定（ホストは必ずおごられる）
// 同伴者の席はサーバ側（handle_new_party → create_group_seats）で人数分作られる。
// 実際の人数・定員・席の種別・金額はサーバ側トリガー／制約が確定させる。
export async function createParty(hostId, fields) {
  const hostGroup = Number(fields.host_group_size);
  const guestGroup = Number(fields.guest_group_size);
  if (!(hostGroup >= MIN_GROUP_SIZE) || !(guestGroup >= MIN_GROUP_SIZE)) {
    throw new Error(`会は${MIN_GROUP_SIZE}名以上のグループ同士でのみ作成できます。`);
  }
  if (fields.room_type != null && fields.room_type !== ROOM_TYPE_OPEN) {
    throw new Error("相席はオープンスペースのみです。個室での会は作成できません。");
  }

  const title = trimTo(fields.title, LIMITS.title);
  if (!title) throw new Error("会の名前を入力してください。");

  // 金額・お会計の区分はクライアントから受け取らない（一律・変更不可）。
  const { host_member_names, room_type, point_request, treat_type, ...rest } = fields;
  const { data, error } = await supabase
    .from("parties")
    .insert({
      host_id: hostId,
      status: "recruiting",
      ...rest,
      title,
      location: trimTo(fields.location, LIMITS.location),
      point_request: JOIN_FEE_PER_PERSON,
      treat_type: TREAT_TYPE_GUEST_TREATS,
      host_group_size: hostGroup,
      guest_group_size: guestGroup,
      host_member_names: normalizeMemberNames(host_member_names, hostGroup),
      max_members: hostGroup + guestGroup,
      current_members: hostGroup,
      room_type: ROOM_TYPE_OPEN,
    })
    .select()
    .single();
  if (error) throw wrapSchemaError(error);
  return data;
}

// 自分が参加している会（チャット一覧用）
export async function listMyParties(userId) {
  const { data, error } = await supabase
    .from("party_members")
    .select("role, parties(*)")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.parties).filter(Boolean);
}

/* ====================== Join requests ======================== */
// グループ単位の参加リクエスト（募集側＝ホストは無料。ポイントは承認時に消費される）
// 同伴者の表示名も一緒に送るが、承認されるまでホストには渡らない（列単位で遮断）。
export async function sendJoinRequest(userId, partyId, groupSize, memberNames) {
  const size = Number(groupSize);
  if (!(size >= MIN_GROUP_SIZE)) {
    throw new Error(`参加は${MIN_GROUP_SIZE}名以上のグループ単位でのみ申し込めます。`);
  }
  const { data, error } = await supabase
    .from("join_requests")
    .insert({
      user_id: userId,
      party_id: partyId,
      group_size: size,
      member_names: normalizeMemberNames(memberNames, size),
      status: "pending",
    })
    .select("id, status, group_size")
    .single();
  if (error) throw wrapSchemaError(error);
  return data;
}

// この会への自分のリクエスト状態を取得（未送信なら null）
export async function getMyJoinRequest(userId, partyId) {
  const { data, error } = await supabase
    .from("join_requests")
    .select("id, status, group_size")
    .eq("user_id", userId)
    .eq("party_id", partyId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

// 自分がホストの会に届いた参加リクエスト（受信箱）
// 承認前に閲覧できるのは「代表者のニックネーム」と「グループ人数」のみ。
// 顔写真・年齢・性別などの個人情報は承認後にのみ参照できる。
export async function listIncomingRequests(userId) {
  const { data: myParties, error: pErr } = await supabase
    .from("parties")
    .select("id")
    .eq("host_id", userId);
  if (pErr) throw pErr;
  const ids = (myParties ?? []).map((p) => p.id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("join_requests")
    .select("id, party_id, group_size, applicant_name, status, created_at, party:party_id(id, title)")
    .in("party_id", ids)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// 参加リクエストへの応答。承認時に参加者→ホストへポイント移動（RPC）。
export async function respondJoinRequest(requestId, status) {
  const fn = status === "accepted" ? "accept_join_request" : "reject_join_request";
  const { error } = await supabase.rpc(fn, { p_request_id: requestId });
  if (error) throw error;
}

/* ========================= Messages ==========================
   チャットは必ず「会（グループ）」に紐づくグループチャットのみ。
   個人間DMの API は存在せず、messages は party_id 必須。
   閲覧・投稿はその会の参加メンバーに限られる（RLS: is_party_member）。
   ============================================================= */
// 発言者のプロフィールも、外部キー名を明示して埋め込む（getPartyMembers と同じ理由）
const MESSAGE_PROFILE = "profiles!messages_user_id_fkey(username, avatar_url)";

export async function listMessages(partyId) {
  const { data, error } = await supabase
    .from("messages")
    .select(`*, ${MESSAGE_PROFILE}`)
    .eq("party_id", partyId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function sendMessage(partyId, userId, content) {
  const body = String(content ?? "").trim();
  if (!body) throw new Error("メッセージを入力してください。");
  if (body.length > LIMITS.message) {
    throw new Error(`メッセージは${LIMITS.message.toLocaleString()}文字以内で入力してください。`);
  }
  const { data, error } = await supabase
    .from("messages")
    .insert({ party_id: partyId, user_id: userId, content: body })
    .select(`*, ${MESSAGE_PROFILE}`)
    .single();
  if (error) throw error;
  return data;
}

/* ====================== 会の取り消し（ホスト） ======================
   ポイントはゲストグループの承認時にホストへ移るため、
   取り消せるのは「まだ1組も承認していない会」だけ（DB 側で判定）。
   ================================================================== */
export async function cancelParty(partyId) {
  const { error } = await supabase.rpc("cancel_party", { p_party: partyId });
  if (error) throw wrapLaunchError(error);
}

/* ========================= お問い合わせ / 通報 =========================
   kind: 'question'（お問い合わせ）| 'feedback'（ご意見）| 'report'（通報）
   ==================================================================== */
export const INQUIRY_KINDS = [
  { key: "question", label: "お問い合わせ" },
  { key: "feedback", label: "ご意見・ご要望" },
  { key: "report", label: "通報・違反の報告" },
];

export async function sendInquiry(userId, { kind, subject, body, replyEmail, targetPartyId, targetUserId }) {
  const text = String(body ?? "").trim();
  if (!text) throw new Error("内容を入力してください。");
  if (text.length > LIMITS.inquiry) {
    throw new Error(`内容は${LIMITS.inquiry.toLocaleString()}文字以内で入力してください。`);
  }
  if (!INQUIRY_KINDS.some((k) => k.key === kind)) {
    throw new Error("種別を選択してください。");
  }
  const email = String(replyEmail ?? "").trim();
  if (email && !isValidEmail(email)) {
    throw new Error("返信先のメールアドレスを正しく入力してください。");
  }

  const { data, error } = await supabase
    .from("inquiries")
    .insert({
      user_id: userId,
      kind,
      subject: trimTo(subject, LIMITS.inquirySubject),
      body: text,
      reply_email: email || null,
      target_party_id: targetPartyId ?? null,
      target_user_id: targetUserId ?? null,
    })
    .select("id, kind, status, created_at")
    .single();
  if (error) throw wrapLaunchError(error);
  return data;
}

export async function listMyInquiries(userId) {
  const { data, error } = await supabase
    .from("inquiries")
    .select("id, kind, subject, body, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw wrapLaunchError(error);
  return data ?? [];
}

/* ============================ お知らせ ============================
   通知専用のテーブルは持たず、既存のデータから組み立てる。
   （通知テーブルを別に持つと、リクエストの承認・却下と通知の
     整合を取るための書き込みが増え、ずれる余地が生まれるため）

   拾うもの:
     ・自分がホストの会に届いた、未対応の参加リクエスト
     ・自分が送ったリクエストの承認 / 見送り
     ・自分が参加している会の、自分以外の新着メッセージ

   既読管理は端末側（localStorage）に持つ。サーバに既読を持たせるほどの
   要件ではなく、端末ごとに独立していて困らないため。
   ================================================================ */
const SEEN_KEY = "aiseki:notifications:seen";

export function loadSeenAt() {
  try {
    const v = window.localStorage.getItem(SEEN_KEY);
    return v ? new Date(v) : null;
  } catch {
    return null;
  }
}

export function markNotificationsSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, new Date().toISOString());
  } catch {
    /* プライベートブラウズ等で書けなくても通知自体は表示できる */
  }
}

export async function listNotifications(userId) {
  const items = [];

  /* ── 自分がホストの会 ── */
  const { data: myParties } = await supabase
    .from("parties")
    .select("id, title")
    .eq("host_id", userId);
  const hosted = myParties ?? [];
  const hostedIds = hosted.map((p) => p.id);
  const titleOf = new Map(hosted.map((p) => [p.id, p.title]));

  if (hostedIds.length > 0) {
    const { data: incoming } = await supabase
      .from("join_requests")
      .select("id, party_id, group_size, applicant_name, status, created_at")
      .in("party_id", hostedIds)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);
    for (const r of incoming ?? []) {
      items.push({
        id: `req-${r.id}`,
        type: "request",
        at: r.created_at,
        partyId: r.party_id,
        title: "グループ参加リクエストが届いています",
        body: `${r.applicant_name || "ゲスト"}さんのグループ（${r.group_size}名）から「${titleOf.get(r.party_id) ?? "会"}」への参加希望`,
      });
    }
  }

  /* ── 自分が出したリクエストの結果 ── */
  const { data: mine } = await supabase
    .from("join_requests")
    .select("id, party_id, status, created_at, party:party_id(title)")
    .eq("user_id", userId)
    .in("status", ["accepted", "rejected"])
    .order("created_at", { ascending: false })
    .limit(20);
  for (const r of mine ?? []) {
    const accepted = r.status === "accepted";
    items.push({
      id: `res-${r.id}`,
      type: accepted ? "accepted" : "rejected",
      at: r.created_at,
      partyId: accepted ? r.party_id : null,
      title: accepted ? "参加が承認されました" : "参加が見送られました",
      body: accepted
        ? `「${r.party?.title ?? "会"}」のグループチャットが始まっています。`
        : `「${r.party?.title ?? "会"}」は今回見送りとなりました。ほかの会を探してみましょう。`,
    });
  }

  /* ── 参加中の会の新着メッセージ ── */
  const { data: seats } = await supabase
    .from("party_members")
    .select("party_id")
    .eq("user_id", userId);
  const partyIds = [...new Set((seats ?? []).map((s) => s.party_id))];
  if (partyIds.length > 0) {
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, party_id, content, created_at, user_id, profiles!messages_user_id_fkey(username)")
      .in("party_id", partyIds)
      .neq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    // 会ごとに最新の1件だけを通知にする（連投で埋まらないようにする）
    const seenParty = new Set();
    for (const m of msgs ?? []) {
      if (seenParty.has(m.party_id)) continue;
      seenParty.add(m.party_id);
      items.push({
        id: `msg-${m.id}`,
        type: "message",
        at: m.created_at,
        partyId: m.party_id,
        chat: true,
        title: `${m.profiles?.username || "メンバー"}さんからメッセージ`,
        body: m.content.length > 60 ? `${m.content.slice(0, 60)}…` : m.content,
      });
    }
  }

  items.sort((a, b) => new Date(b.at) - new Date(a.at));
  return items.slice(0, 30);
}

// Realtime 購読。unsubscribe 関数を返す。
export function subscribeMessages(partyId, onInsert) {
  const channel = supabase
    .channel(`messages:${partyId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `party_id=eq.${partyId}` },
      (payload) => onInsert(payload.new)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}
