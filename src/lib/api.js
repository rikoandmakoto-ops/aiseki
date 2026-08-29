import { supabase } from "./supabase";
import {
  MIN_GROUP_SIZE,
  MIN_HOST_GROUP_SIZE,
  MIN_GUEST_GROUP_SIZE,
  GUEST_SLOT_SIZE,
  BILLABLE_MIN_GUESTS,
  SOLO_FEE,
  INVITE_DISCOUNT,
  INVITE_FEE,
  PAY_MODE_BUNDLE,
  PAY_MODE_SPLIT,
  PAY_MODE_INVITE,
  PAY_MODES,
  DEFAULT_PAY_MODE,
  PARTNER_NONE,
  PARTNER_PENDING,
  PARTNER_CONFIRMED,
  PARTNER_DECLINED,
  ACCOUNT_FULL,
  ACCOUNT_SIMPLE,
  MAX_GROUP_MEMBERS,
  billableGuests,
  joinFeeTotal,
  myJoinCharge,
  joinChargeBreakdown,
  JOIN_FEE_PER_PERSON,
  SIGNUP_BONUS,
  REFERRAL_BONUS,
  SIGNUP_BONUS_SEATS,
  MIN_AGE,
  GENDER_OPTIONS,
  APPROACH_GENDER,
  APPROACH_LIMIT,
  DRINKING_STYLES,
  MAX_DRINKING_STYLES,
  RANK_TIERS,
  RANK_MIN_REVIEWS,
  DEFAULT_RANK_KEY,
  rankTier,
  rankForReviews,
  budgetTierFor,
  canUseBudgetTier,
  DEFAULT_GUEST_TIER,
  canRequireGuestTier,
  requirableGuestTiers,
  canJoinWithTier,
  hasGuestTierGate,
} from "./pricing.js";

/* =====================================================================
   相席（グループ飲み会）の共通ルール
   ・1つの会は「ホスト側2名以上」×「参加側2名以上」でのみ成立する（1対1は不可）
   ・相席はオープンスペースのみ。個室での相席は提供しない
     （出会い系喫茶に該当するリスクを避けるため）
   ・20歳以上限定（飲酒を伴うため）
   ・個人プロフィールは同じ会に参加承認された相手にのみ公開（RLSで担保）
   ・チャットは会（グループ）単位のみ。個人間DMは存在しない。
     会に参加していない方から募集中の会へ送れる「アプローチ」も、
     宛先は会であってメンバー全員が読む（個人宛ではない）
   ※ いずれも DB 側（制約・トリガー）でも二重に強制している。

   人数・料金・年齢の数字そのものは src/lib/pricing.js が出典。
   広告用のランディングページ（src/lp/*）も同じファイルを読むため、
   ここでは再輸出だけを行う（api.MIN_AGE のような既存の参照はそのまま動く）。
   ===================================================================== */
export {
  MIN_GROUP_SIZE,
  MIN_HOST_GROUP_SIZE,
  MIN_GUEST_GROUP_SIZE,
  GUEST_SLOT_SIZE,
  BILLABLE_MIN_GUESTS,
  SOLO_FEE,
  INVITE_DISCOUNT,
  INVITE_FEE,
  PAY_MODE_BUNDLE,
  PAY_MODE_SPLIT,
  PAY_MODE_INVITE,
  PAY_MODES,
  DEFAULT_PAY_MODE,
  PARTNER_NONE,
  PARTNER_PENDING,
  PARTNER_CONFIRMED,
  PARTNER_DECLINED,
  ACCOUNT_FULL,
  ACCOUNT_SIMPLE,
  MAX_GROUP_MEMBERS,
  billableGuests,
  joinFeeTotal,
  myJoinCharge,
  joinChargeBreakdown,
  JOIN_FEE_PER_PERSON,
  SIGNUP_BONUS,
  REFERRAL_BONUS,
  SIGNUP_BONUS_SEATS,
  MIN_AGE,
  GENDER_OPTIONS,
  APPROACH_GENDER,
  APPROACH_LIMIT,
  DRINKING_STYLES,
  MAX_DRINKING_STYLES,
  RANK_TIERS,
  RANK_MIN_REVIEWS,
  DEFAULT_RANK_KEY,
  rankTier,
  rankForReviews,
  budgetTierFor,
  canUseBudgetTier,
  DEFAULT_GUEST_TIER,
  canRequireGuestTier,
  requirableGuestTiers,
  canJoinWithTier,
  hasGuestTierGate,
};

/* 飲みスタイルタグの値だけの配列（保存前の絞り込みに使う） */
export const DRINKING_STYLE_KEYS = DRINKING_STYLES.map((s) => s.key);

/* お会計の区分。ホストは必ずおごられるため、これ以外は保存できない。 */
export const TREAT_TYPE_GUEST_TREATS = "ゲストのおごり";

/* 参加グループが支払う合計ポイント。
   ⚠ 1名で申し込んでも2名分（SOLO_FEE = 7,600pt）を頂く。
     金額の出典は pricing.js の joinFeeTotal（DB の join_fee_total() と同じ規則）。 */
export const joinFeeFor = (groupSize) => joinFeeTotal(groupSize);

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
  area: 40,
  message: 2000,
  inquiry: 4000,
  inquirySubject: 120,
  favoriteFood: 60,
  favoriteDrink: 60,
  occupation: 40,
  homeArea: 40,
  hobby: 20,
  /* 会に参加していない方から募集中の会へ送るメッセージ（アプローチ）。
     会話の場ではなく「ひとこと伝える」ためのものなので、短くしてある。 */
  approach: 200,
  /* レビューのコメント（運営だけが読む） */
  reviewComment: 1000,
};

/* プロフィール写真の枚数。
   メイン（avatar_url）1枚＋サブ（photos）最大5枚で、合わせて最大6枚。
   DB 側の profiles_photos_len 制約も同じ上限を持つ。 */
export const MAX_SUB_PHOTOS = 5;
export const MAX_PHOTOS = MAX_SUB_PHOTOS + 1;

/* 趣味は自由入力だが、候補を出して選びやすくする（最大8個） */
export const MAX_HOBBIES = 8;
export const HOBBY_SUGGESTIONS = [
  "食べ歩き", "お酒", "ワイン", "日本酒", "クラフトビール", "カフェ巡り",
  "旅行", "映画", "音楽", "ライブ", "フェス", "読書",
  "カメラ", "アート", "サウナ", "筋トレ", "ランニング", "ゴルフ",
  "サーフィン", "スノーボード", "ダーツ", "ビリヤード", "料理", "ドライブ",
  "ペット", "ファッション", "ゲーム", "アニメ", "スポーツ観戦", "投資",
];

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
/* 20歳未満は利用禁止（飲酒を伴う業態のため）。MIN_AGE は pricing.js が出典。 */

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
/* accountType:
     'full'   … 通常の登録（プロフィール＋年齢確認。性別が要る）
     'simple' … 招待リンクからの簡易登録（名前＋年齢確認＋写真だけ）。
                性別は聞かない（アプローチ機能を使えないため必要が無い）。
   signupIntent: 'host' | 'guest' | null
     どちらの入口から来たかを記録する。カード登録を促すかどうかの
     出し分けにだけ使い、権限には一切影響しない
     （ホストはカード登録不要・ボーナスなしで完全無料）。 */
export async function signUp({
  email, password, username, birthDate, gender, ageConfirmed,
  accountType = ACCOUNT_FULL, signupIntent = null,
}) {
  if (!ageConfirmed) {
    throw new Error(`${MIN_AGE}歳以上であることの確認と、利用規約への同意が必要です。`);
  }
  const kind = accountType === ACCOUNT_SIMPLE ? ACCOUNT_SIMPLE : ACCOUNT_FULL;
  /* 性別は、募集中の会へのアプローチを送れるかどうかの判定にのみ使う。
     他のユーザーに表示することはなく、会の参加条件にもならない。
     登録後は変更できない（DB 側の on_profile_gender_lock でも止めている）ため、
     ここで選択肢に無い値を弾いておく。
     簡易登録では最初から集めない。 */
  if (kind === ACCOUNT_FULL && !GENDER_OPTIONS.includes(gender)) {
    throw new Error("性別を選択してください。");
  }
  const age = ageFromBirthDate(birthDate);
  if (age === null) {
    throw new Error("生年月日を正しく入力してください。");
  }
  if (age < MIN_AGE) {
    throw new Error(`本サービスは${MIN_AGE}歳未満の方はご利用いただけません。`);
  }
  /* メール確認を有効にすると、確認リンクの戻り先は Supabase の Site URL になる。
     Site URL の設定漏れ（既定は localhost）で全員のリンクが死ぬのを避けるため、
     パスワード再設定と同じく、戻り先をこちらから明示する。
     ※ この戻り先は Supabase の Redirect URLs に登録されている必要がある。 */
  const emailRedirectTo =
    typeof window === "undefined" ? undefined : `${window.location.origin}/`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: {
        username,
        birth_date: birthDate,
        age: String(age),
        gender: kind === ACCOUNT_FULL ? gender : null,
        age_confirmed: true,
        account_type: kind,
        signup_intent: signupIntent === "host" || signupIntent === "guest" ? signupIntent : null,
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
/* gender は列ごと遮断してある（同じ会のメンバーでも他人の性別は読めない）。
   本人が自分の設定を見るときだけ my_gender() を使う。 */
const PROFILE_COLUMNS =
  "id, username, avatar_url, age, bio, created_at, " +
  "photos, hobbies, favorite_food, favorite_drink, occupation, home_area, " +
  "drinking_style, avatar_blur_url, photos_blur";

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/* 自分の性別（未設定なら null）。他のユーザーの性別は取得できない。 */
export async function getMyGender() {
  const { data, error } = await supabase.rpc("my_gender");
  if (error) throw wrapFeature3Error(error);
  return data ?? null;
}

/* 自分のプロフィール。性別は列単位で遮断してあるので RPC で足す。 */
export async function getMyProfile(userId) {
  const [profile, gender] = await Promise.all([
    getProfile(userId),
    getMyGender().catch(() => null),
  ]);
  return profile ? { ...profile, gender } : profile;
}

// プロフィール更新。年齢は 20歳未満に書き換えられない（DB 側の制約でも拒否される）。
// 生年月日は年齢確認の根拠のため、ここからは変更できない。
// 文字数・画像URLのスキームはここで正規化してから送る。
export async function updateProfile(userId, fields) {
  const {
    birth_date, age, username, bio, avatar_url,
    photos, hobbies, favorite_food, favorite_drink, occupation, home_area,
    gender, drinking_style, avatar_blur_url, photos_blur,
    ...rest
  } = fields;

  const patch = { ...rest };

  /* 性別は未設定のときに一度だけ登録できる。あとから変えることはできない
     （DB 側の on_profile_gender_lock でも止めている）。 */
  if (gender !== undefined && gender !== null && gender !== "") {
    if (!GENDER_OPTIONS.includes(gender)) {
      throw new Error("性別は選択肢から選んでください。");
    }
    patch.gender = gender;
  }

  /* 飲みスタイルタグ。選択肢に無い値・重複は落として上限で切る
     （DB 側の profiles_drinking_style_check も同じ条件を持つ）。 */
  if (drinking_style !== undefined) {
    const seen = new Set();
    patch.drinking_style = (Array.isArray(drinking_style) ? drinking_style : [])
      .filter((s) => {
        if (!DRINKING_STYLE_KEYS.includes(s) || seen.has(s)) return false;
        seen.add(s);
        return true;
      })
      .slice(0, MAX_DRINKING_STYLES);
  }

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

  /* サブ写真。avatar_url と同じく、自前のストレージに上げた画像だけを通す。
     混ざっていたら黙って落とす（不正なURLを保存させない）。 */
  if (photos !== undefined) {
    patch.photos = (Array.isArray(photos) ? photos : [])
      .map((u) => safeImageUrl(u))
      .filter(Boolean)
      .slice(0, MAX_SUB_PHOTOS);
  }

  /* ぼかし写真。マッチ前に配信されるのはこちらだけ。
     素の写真と同じく、自前のストレージに上げた画像だけを通す。 */
  if (avatar_blur_url !== undefined) {
    patch.avatar_blur_url = avatar_blur_url ? safeImageUrl(avatar_blur_url) : null;
  }
  if (photos_blur !== undefined) {
    patch.photos_blur = (Array.isArray(photos_blur) ? photos_blur : [])
      .map((u) => safeImageUrl(u))
      .filter(Boolean)
      .slice(0, MAX_SUB_PHOTOS);
  }

  if (hobbies !== undefined) {
    /* 重複と空欄を落として上限で切る */
    const seen = new Set();
    patch.hobbies = (Array.isArray(hobbies) ? hobbies : [])
      .map((h) => trimTo(h, LIMITS.hobby))
      .filter((h) => {
        if (!h || seen.has(h)) return false;
        seen.add(h);
        return true;
      })
      .slice(0, MAX_HOBBIES);
  }

  if (favorite_food !== undefined) patch.favorite_food = trimTo(favorite_food, LIMITS.favoriteFood);
  if (favorite_drink !== undefined) patch.favorite_drink = trimTo(favorite_drink, LIMITS.favoriteDrink);
  if (occupation !== undefined) patch.occupation = trimTo(occupation, LIMITS.occupation);
  if (home_area !== undefined) patch.home_area = trimTo(home_area, LIMITS.homeArea);

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw wrapFeature3Error(wrapSchemaError(error));
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

/* ==================== 薄モザイク（ぼかし画像） ====================
   マッチが成立するまで、相手に配信するのは「ぼかした別画像」だけ。
   元の写真の URL はサーバから返らない（party_host_preview / RLS）。

   ⚠ CSS の filter でぼかすのでは意味がない。素の画像を配ってしまえば
     開発者ツールで外せるため、アップロードの時点で
     「小さく潰してから伸ばした別ファイル」を作って保存する。
     縮小を挟むので、ぼかしを解いて元に戻すことはできない。
   ================================================================ */
const BLUR_WIDTH = 64;     // いったんここまで小さくする（情報を捨てる）
const BLUR_RADIUS = 6;     // そのうえで軽くぼかす

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("画像を読み込めませんでした。")); };
    img.src = url;
  });
}

/* 1人写りの写真をそのままの構図で薄くぼかす（顔の位置は変えない） */
export async function makeBlurredImage(file) {
  const img = await loadImage(file);
  const ratio = img.height / img.width || 1;
  const sw = BLUR_WIDTH;
  const sh = Math.max(1, Math.round(BLUR_WIDTH * ratio));

  // 1) 小さく描いて情報そのものを捨てる
  const small = document.createElement("canvas");
  small.width = sw; small.height = sh;
  small.getContext("2d").drawImage(img, 0, 0, sw, sh);

  // 2) 元の大きさに戻しつつ、さらにぼかす
  const out = document.createElement("canvas");
  const ow = Math.min(img.width, 720);
  out.width = ow;
  out.height = Math.max(1, Math.round(ow * ratio));
  const ctx = out.getContext("2d");
  ctx.filter = `blur(${BLUR_RADIUS}px)`;
  ctx.drawImage(small, 0, 0, out.width, out.height);

  const blob = await new Promise((res) => out.toBlob(res, "image/jpeg", 0.7));
  if (!blob) throw new Error("ぼかし画像を作れませんでした。");
  return new File([blob], "blur.jpg", { type: "image/jpeg" });
}

/* ── 登録前に選んだ写真を、端末に控えておくための変換 ────────────
   招待リンクからの簡易登録は、メール確認が済むまでセッションが無い。
   その場ではストレージへ上げられない（avatars のポリシーが auth.uid() の
   フォルダを要求する）ので、いったん小さくして端末に控え、
   確認メールから戻ってログインした時点で上げる（App.jsx）。
   ⚠ 縮小しないと localStorage の容量（数MB）に収まらない。
   ──────────────────────────────────────────────────────── */
const PENDING_PHOTO_WIDTH = 720;

export async function shrinkImageFile(file, maxWidth = PENDING_PHOTO_WIDTH) {
  if (!file) throw new Error("画像を選択してください。");
  if (!AVATAR_MIME.includes(file.type)) {
    throw new Error("画像は JPEG・PNG・WebP のいずれかを選択してください。");
  }
  const img = await loadImage(file);
  const w = Math.min(img.width || maxWidth, maxWidth);
  const h = Math.max(1, Math.round(w * ((img.height / img.width) || 1)));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.82));
  if (!blob) throw new Error("画像を読み込めませんでした。");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("画像を読み込めませんでした。"));
    r.readAsDataURL(file);
  });
}

export async function dataUrlToFile(dataUrl, name = "photo.jpg") {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}

/* 写真を1枚アップロードして、素の画像とぼかし画像の両方のURLを返す。
   ぼかしの生成に失敗しても登録自体は通す（blurUrl が null になる）。 */
export async function uploadAvatarPair(userId, file) {
  const url = await uploadAvatar(userId, file);
  let blurUrl = null;
  try {
    blurUrl = await uploadAvatar(userId, await makeBlurredImage(file));
  } catch (e) {
    console.error("[aiseki] ぼかし画像の生成に失敗:", e);
  }
  return { url, blurUrl };
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

/* ==================== プロフィールの充実度 ====================
   「あと何を書けば伝わるか」を本人に示すための指標。
   会の一覧には出ない情報なので、承認後に相手へ伝わる中身が
   どれだけ揃っているかだけを見る。

   重みは「相手が知りたい順」に置く。写真とひとことが最も効くので厚く、
   細かい項目は軽く数える。合計を 100 に正規化する。
   ============================================================== */
const COMPLETION_ITEMS = [
  { key: "avatar_url", label: "メインの写真", weight: 26, done: (p) => !!p?.avatar_url },
  { key: "photos", label: "サブの写真（1枚以上）", weight: 12, done: (p) => (p?.photos?.length ?? 0) > 0 },
  { key: "username", label: "ニックネーム", weight: 10, done: (p) => !!p?.username },
  { key: "bio", label: "自己紹介（20文字以上）", weight: 20, done: (p) => (p?.bio?.trim().length ?? 0) >= 20 },
  { key: "hobbies", label: "趣味（2つ以上）", weight: 12, done: (p) => (p?.hobbies?.length ?? 0) >= 2 },
  { key: "drinking_style", label: "飲みスタイル", weight: 8, done: (p) => (p?.drinking_style?.length ?? 0) > 0 },
  { key: "favorite_food", label: "好きな食べもの", weight: 6, done: (p) => !!p?.favorite_food },
  { key: "favorite_drink", label: "好きなお酒・飲みもの", weight: 6, done: (p) => !!p?.favorite_drink },
  { key: "occupation", label: "お仕事", weight: 4, done: (p) => !!p?.occupation },
  { key: "home_area", label: "よく行くエリア", weight: 4, done: (p) => !!p?.home_area },
];

export function profileCompletion(profile) {
  const total = COMPLETION_ITEMS.reduce((s, i) => s + i.weight, 0);
  const items = COMPLETION_ITEMS.map((i) => ({ key: i.key, label: i.label, done: i.done(profile) }));
  const earned = COMPLETION_ITEMS.reduce((s, i) => s + (i.done(profile) ? i.weight : 0), 0);
  return {
    percent: Math.round((earned / total) * 100),
    items,
    missing: items.filter((i) => !i.done),
  };
}

/* 充実度に応じた呼び名。数字だけだと「まだ足りない」しか伝わらないため。 */
export function completionRank(percent) {
  if (percent >= 100) return { label: "完璧です", tone: "gold" };
  if (percent >= 80) return { label: "とても充実", tone: "gold" };
  if (percent >= 55) return { label: "もう少し", tone: "mid" };
  if (percent >= 25) return { label: "書きかけ", tone: "low" };
  return { label: "はじめましょう", tone: "low" };
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

/* ========================== Parties ========================== */
// 一覧・詳細では会の情報（場所・時間・人数・ポイント）と
// ホストのニックネーム（parties.host_name）だけを取得する。
// 参加者個人のプロフィールは join せず、承認後に getPartyMembers() でのみ取得する。
/* ======================== 絞り込み ========================
   エリア・開催日・時間帯・募集グループ人数で絞り込む。

   日付と人数は DB 側で絞り、時間帯だけは手元で絞る
   （party_time は 'HH:MM' の文字列なので、範囲比較は
     文字列の大小で正しく効くが、旧データに書式のゆれが
     残っている可能性があるため手元で解釈する）。
   ======================================================== */
export const DATE_FILTERS = [
  { key: "all", label: "すべて" },
  { key: "today", label: "今日" },
  { key: "tomorrow", label: "明日" },
  { key: "weekend", label: "今週末" },
  { key: "week", label: "1週間以内" },
];

export const TIME_FILTERS = [
  { key: "all", label: "すべて" },
  { key: "early", label: "〜19:59", from: 0, to: 19 * 60 + 59 },
  { key: "prime", label: "20:00〜21:59", from: 20 * 60, to: 21 * 60 + 59 },
  { key: "late", label: "22:00〜", from: 22 * 60, to: 24 * 60 },
];

export const SIZE_FILTERS = [
  { key: "all", label: "すべて" },
  { key: "2", label: "2名", size: 2 },
  { key: "3", label: "3名", size: 3 },
  { key: "4+", label: "4名以上", size: 4 },
];

/* ローカル日付を YYYY-MM-DD で返す（toISOString は UTC 変換で日がずれる） */
export function toDateString(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* 絞り込みキーから [開始日, 終了日] を求める（両端を含む） */
export function dateRangeFor(key, now = new Date()) {
  const day = (offset) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    return d;
  };
  switch (key) {
    case "today": return [toDateString(now), toDateString(now)];
    case "tomorrow": return [toDateString(day(1)), toDateString(day(1))];
    case "weekend": {
      // 今日から見て次に来る金曜〜日曜（今日が週末ならその週末）
      const dow = now.getDay();                 // 0=日 … 6=土
      const toFri = dow === 0 ? 0 : (5 - dow + 7) % 7;
      const start = dow === 0 || dow === 6 ? now : day(toFri);
      const end = new Date(start);
      end.setDate(end.getDate() + (start.getDay() === 0 ? 0 : 7 - start.getDay()));
      return [toDateString(start), toDateString(end)];
    }
    case "week": return [toDateString(now), toDateString(day(7))];
    default: return null;
  }
}

/* 'HH:MM' を「その日の何分目か」に変換する。読めなければ null。 */
function minutesOfDay(text) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(text ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

export async function listParties(filters) {
  // 旧来の呼び出し（エリア文字列をそのまま渡す形）にも対応する
  const f = typeof filters === "string" || filters == null ? { area: filters } : filters;

  let q = supabase
    .from("parties")
    .select("*")
    .eq("status", "recruiting")
    .order("created_at", { ascending: false });

  if (f.area) q = q.eq("area", f.area);

  const range = dateRangeFor(f.date);
  if (range) q = q.gte("party_date", range[0]).lte("party_date", range[1]);

  const size = SIZE_FILTERS.find((s) => s.key === f.size)?.size;
  if (size) {
    if (f.size === "4+") q = q.gte("guest_group_size", 4);
    else q = q.eq("guest_group_size", size);
  }

  if (f.keyword) {
    const kw = String(f.keyword).trim().replace(/[%,]/g, " ");
    if (kw) q = q.or(`title.ilike.%${kw}%,location.ilike.%${kw}%,area.ilike.%${kw}%`);
  }

  const { data, error } = await q;
  if (error) throw error;

  let rows = data ?? [];

  const time = TIME_FILTERS.find((t) => t.key === f.time && t.key !== "all");
  if (time) {
    rows = rows.filter((p) => {
      const m = minutesOfDay(p.party_time);
      return m !== null && m >= time.from && m <= time.to;
    });
  }

  // 満席の会は絞り込みに関わらず後ろに回す（見に行っても申し込めないため）
  return rows.sort((a, b) => {
    const openA = a.max_members - a.current_members >= MIN_GROUP_SIZE ? 0 : 1;
    const openB = b.max_members - b.current_members >= MIN_GROUP_SIZE ? 0 : 1;
    return openA - openB;
  });
}

/* ============ ひとつ上のランク帯の会（ホームの「もう少しで届く会」）============
   自分のランクでは申し込めない帯を、あえて見せる。
   ランクを上げる意味を伝えるための導線で、参加はできない
   （実際の可否は DB の enforce_group_join が決める）。

   ⚠ 実在の募集だけを返す。件数が足りないときに並べる「見本」は
     src/lib/nextTier.js が作り、画面が【例】と明示して出す。
     ここで見本を混ぜてはいけない（実在の募集と区別できなくなる）。
   ========================================================================= */
export async function listPartiesRequiringTier(tierKey, limit = 6) {
  if (!tierKey) return [];
  const { data, error } = await supabase
    .from("parties")
    .select("*")
    .eq("status", "recruiting")
    .eq("min_guest_tier", tierKey)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw wrapMutualRankError(error);
  return data ?? [];
}

/* 会の開催日を人が読む形にする（今日・明日は言葉で返す） */
export function formatPartyDate(value) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const diff = Math.round((d - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  if (diff === 0) return "今日";
  if (diff === 1) return "明日";
  if (diff === 2) return "明後日";
  const dow = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}（${dow}）`;
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
/* rank_tier（4段階の区分）は 2026-08-25 から同じ会のメンバーにだけ見える。
   平均点・件数（review_average / review_count）は本人だけなので、
   ここに足さないこと（DB 側の列単位 SELECT 権限にも入っていない）。 */
const MEMBER_PROFILE =
  "profiles!party_members_user_id_fkey(" +
  "id, username, avatar_url, age, bio, photos, hobbies, " +
  "favorite_food, favorite_drink, occupation, home_area, drinking_style, rank_tier)";

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
/* 2026-08-28 の新フロー:
     ・ホストは先にグループ（友達2名以上）を作り、その group_id で卓を立てる。
       人数・同伴者名はサーバがグループから確定させる（クライアントは送らない）。
     ・ゲスト側の枠はホストが選ばない（常に GUEST_SLOT_SIZE ＝2名分）。 */
export async function createParty(hostId, fields) {
  const groupId = fields.group_id ?? null;
  const hostGroup = Number(fields.host_group_size);
  if (!groupId && !(hostGroup >= MIN_HOST_GROUP_SIZE)) {
    throw new Error(
      `会を立てるには、あなたを含めて${MIN_HOST_GROUP_SIZE}名以上のグループが必要です。先に友達を招待してください。`
    );
  }
  if (fields.room_type != null && fields.room_type !== ROOM_TYPE_OPEN) {
    throw new Error("相席はオープンスペースのみです。個室での会は作成できません。");
  }

  const title = trimTo(fields.title, LIMITS.title);
  if (!title) throw new Error("会の名前を入力してください。");

  // 店舗カタログは廃止した。お店の名前はホストが自由に書く（必須）。
  const location = trimTo(fields.location, LIMITS.location);
  if (!location) throw new Error("お店の名前を入力してください。");

  /* 🚨 ここに列を足すときは、必ず parties の INSERT 権限（列単位）にも足すこと。
     migration_security_hardening.sql で「会を作るときに必要な列」だけに絞ってあり、
     権限の無い列を1つでも積むと insert 全体が
     42501 permission denied for table parties で落ちる（画面には出せない）。

     status / room_type / point_request / treat_type / max_members / current_members は
     DB 側の既定値と enforce_group_party() が確定させる。クライアントからは送らない
     （送ると上のとおり権限エラーになる）。
     予算の実額（avg_budget）も同じ。列単位の INSERT 権限に入っていないうえ、
     enforce_group_party() が shop_id の無い会では必ず null に落とす。
     予算はランクで選べる帯（budget_tier）だけを送る。 */
  const {
    host_member_names, room_type, point_request, treat_type, avg_budget,
    status, max_members, current_members, shop_id, group_id,
    host_group_size, guest_group_size,
    ...rest
  } = fields;

  /* グループから立てるときは、人数も同伴者名もサーバがグループの実体から
     確定させる（enforce_group_party）。クライアントの申告は使わない。 */
  const fromGroup = !!groupId;
  const { data, error } = await supabase
    .from("parties")
    .insert({
      host_id: hostId,
      ...rest,
      title,
      budget_tier: fields.budget_tier || DEFAULT_RANK_KEY,
      /* 参加者に求めるランク。既定は最下位＝誰でも申し込める。
         性別その他の属性を参加条件にすることはできない（ランクだけ）。 */
      min_guest_tier: fields.min_guest_tier || DEFAULT_GUEST_TIER,
      location,
      area: trimTo(fields.area, LIMITS.area) || null,
      ...(fromGroup
        ? { group_id: groupId }
        : {
            host_group_size: hostGroup,
            host_member_names: normalizeMemberNames(host_member_names, hostGroup),
          }),
    })
    .select()
    .single();
  if (error) throw wrapNewFlowError(wrapSchemaError(wrapMutualRankError(error)));
  return data;
}

/* ======================= ホスト側グループ =======================
   卓を立てる前に作る「友達の箱」。招待リンクで呼んだ友達は
   簡易登録（名前＋年齢確認＋写真）を済ませるとここに結びつく。
   あなたを含めて MIN_HOST_GROUP_SIZE 名以上そろうと卓を立てられる。

   ⚠ 招待コードはテーブルから直接読めない（列単位で遮断してある）。
     取得経路は list_my_groups() だけ。
   ============================================================== */
export async function listMyGroups() {
  const { data, error } = await supabase.rpc("list_my_groups");
  if (error) throw wrapNewFlowError(error);
  return data ?? [];
}

export async function createGroup(name) {
  const { data, error } = await supabase.rpc("create_group", {
    p_name: trimTo(name, 30) ?? "マイグループ",
  });
  if (error) throw wrapNewFlowError(error);
  return data;   // group id
}

export async function addGroupMember(groupId, displayName) {
  const { data, error } = await supabase.rpc("add_group_member", {
    p_group: groupId,
    p_name: trimTo(displayName, LIMITS.username) ?? "",
  });
  if (error) throw wrapNewFlowError(error);
  return data;   // { id, invite_code }
}

export async function removeGroupMember(memberId) {
  const { error } = await supabase.rpc("remove_group_member", { p_member: memberId });
  if (error) throw wrapNewFlowError(error);
}

/* ── 招待リンク（?invite=CODE）─────────────────────────────
   コードの置き場は3か所ある。リンクは1本なので、DB 側が振り分ける。
     group … ホストが友達を集めるグループの枠
     join  … 参加申請の「招待して呼ぶ」（承認前）
     seat  … 会の席（承認後・未登録の同伴者）
   ⚠ 個別の RPC（group_invite_preview / claim_group_invite / claim_seat）は
     そのまま残してあるが、画面からは invitePreview / claimInvite を使うこと。
   ──────────────────────────────────────────────────────── */

/* 招待リンクを開いた人に見せる情報。まだ登録していない人も呼べる。
   返るのは「誰に招かれたか」だけで、プロフィールは含まれない。 */
export async function invitePreview(code) {
  const { data, error } = await supabase.rpc("invite_preview", {
    p_code: String(code || "").trim().toUpperCase(),
  });
  if (error) throw wrapInviteError(error);
  return data ?? null;   // { kind, group_name, owner_name, display_name, claimed }
}

/* 簡易登録の直後に呼ぶ。招待された枠を自分のアカウントで引き受ける。 */
export async function claimInvite(code) {
  const { data, error } = await supabase.rpc("claim_invite", {
    p_code: String(code || "").trim().toUpperCase(),
  });
  if (error) throw wrapInviteError(error);
  return data;   // { kind, group_id | party_id }
}

/* migration_invite_discount.sql が未適用のときに分かりやすいエラーへ変換する */
function wrapInviteError(error) {
  const msg = error?.message || "";
  if (/issue_join_invite|list_partner_requests|confirm_join_partner|decline_join_partner|join_invites|partner_status/i.test(msg)) {
    return new Error(
      "この機能に必要なデータベースの更新がまだ適用されていません。" +
      "supabase/migration_partner_consent.sql を実行してください。"
    );
  }
  if (/invite_preview|claim_invite|my_join_invite|invite_discount|join_charge_of|schema cache/i.test(msg)) {
    return new Error(
      "この機能に必要なデータベースの更新がまだ適用されていません。" +
      "supabase/migration_invite_discount.sql を実行してください。"
    );
  }
  return wrapNewFlowError(error);
}

/* 卓を立てられるグループ（人数がそろっているもの）だけを返す */
export const groupIsReady = (group) =>
  (group?.members?.length ?? 0) >= MIN_HOST_GROUP_SIZE;

/* 招待リンクの URL。登録画面まで一気に運ぶ（3種のコードで共通）。 */
export function inviteUrl(code) {
  const origin = typeof window === "undefined" ? "https://aisekimatch.com" : window.location.origin;
  return `${origin}/?invite=${encodeURIComponent(code)}`;
}
export const groupInviteUrl = inviteUrl;

export function groupInviteShareText(code, ownerName) {
  return (
    `${ownerName || "友だち"}さんから AISEKI（大人のグループ相席）のグループに招待されました。\n` +
    "お名前・年齢確認・写真だけの簡単な登録で参加できます（費用はかかりません）。\n" +
    inviteUrl(code)
  );
}

/* 参加申請の「招待して呼ぶ」で相方に送る文面。
   ⚠ 相方は1ptも払わない（割引を受けるのは申し込んだ側）。誤解が出ないように書く。 */
export function joinInviteShareText(code, myName, partyTitle) {
  return (
    `${myName || "友だち"}さんから AISEKI（大人のグループ相席）の相席にお誘いがあります。\n` +
    (partyTitle ? `会: ${partyTitle}\n` : "") +
    "お名前・年齢確認・お写真だけの簡単な登録でご参加いただけます（費用はかかりません）。\n" +
    inviteUrl(code)
  );
}

/* ==================== 自分のアカウント種別 ====================
   'simple'（招待からの簡易登録）は、卓を立てることも参加を申し込むことも
   できない。招待されたグループのメンバーとして会に入るだけ。
   ============================================================== */
export async function getMyAccount() {
  const { data, error } = await supabase.rpc("my_account");
  if (error) throw wrapNewFlowError(error);
  return data ?? null;   // { account_type, signup_intent, card_registered, has_photo }
}

export const isSimpleAccount = (account) => account?.account_type === ACCOUNT_SIMPLE;

/* ====================== モザイク（マッチ前） ======================
   マッチが成立するまで、ホストの写真は「ぼかし」だけを配信する。
   素のURLはサーバから返らない（画面側でぼかしているのではない）。

   ⚠ この経路に性別・評価（平均点・件数・ランク）を足してはいけない。
     足した瞬間に「マッチ前の他人」に開示されることになる。
   ================================================================ */
export async function getPartyHostPreview(partyId) {
  const { data, error } = await supabase.rpc("party_host_preview", { p_party: partyId });
  if (error) throw wrapNewFlowError(error);
  return data ?? null;
}

/* 会の一覧に出すホストのぼかし写真（parties に非正規化してある） */
export const partyHostBlurUrl = (party) => safeImageUrl(party?.host_avatar_blur_url);

/* migration_new_flow.sql が未適用のときに分かりやすいエラーへ変換する */
function wrapNewFlowError(error) {
  const msg = error?.message || "";
  if (/list_my_groups|create_group|add_group_member|claim_group_invite|group_invite_preview|my_account|party_host_preview|join_charge_preview|avatar_blur_url|photos_blur|account_type|pay_mode|billable_size|partner_id|group_id|schema cache/i.test(msg)) {
    return new Error(
      "この機能に必要なデータベースの更新がまだ適用されていません。" +
      "supabase/migration_new_flow.sql を実行してください。"
    );
  }
  return error;
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
/* 参加リクエスト。導線は3つ（画面の並びと同じ）。
     ・既存の会員と参加 … partnerId を指定。各自払い／まとめ払いを選べる
     ・招待して呼ぶ     … payMode を 'invite' に。招待割 3,800pt が引かれ、
                          送信後に招待リンクが発行される（myJoinInvite）
     ・相方は登録しない … 名前だけ memberNames に入れる／1名で申し込む。
                          どちらも 7,600pt

   ⚠ この時点では1ptも動かない。決済はホストが承認した時点（マッチ成立）。 */
export async function sendJoinRequest(
  userId, partyId, groupSize, memberNames,
  { partnerId = null, payMode = PAY_MODE_BUNDLE } = {}
) {
  const size = Number(groupSize);
  if (!(size >= MIN_GUEST_GROUP_SIZE)) {
    throw new Error("参加人数を選んでください。");
  }
  const mode = [PAY_MODE_SPLIT, PAY_MODE_INVITE].includes(payMode) ? payMode : PAY_MODE_BUNDLE;
  if (mode === PAY_MODE_SPLIT && !partnerId) {
    throw new Error("各自払いは、相方が既存の会員のときにのみ選べます。");
  }
  if (mode === PAY_MODE_INVITE) {
    if (partnerId) throw new Error("招待して呼ぶ場合、相方の会員コードは指定できません。");
    if (size !== 2) throw new Error("招待して呼ぶ場合は2名でお申し込みください。");
  }
  if (partnerId && size !== 2) {
    throw new Error("相方を指定するときは2名でお申し込みください。");
  }
  /* 同伴者名は「自分と相方を除いた人数分」。相方が既存会員なら0人分。 */
  const extra = size - 1 - (partnerId ? 1 : 0);
  const { data, error } = await supabase
    .from("join_requests")
    .insert({
      user_id: userId,
      party_id: partyId,
      group_size: size,
      member_names: normalizeMemberNames(memberNames, Math.max(extra, 0) + 1),
      pay_mode: mode,
      partner_id: partnerId,
      status: "pending",
    })
    .select("id, status, group_size, pay_mode, billable_size")
    .single();
  /* ランクが足りないときの文言は DB のトリガーが日本語で返すので、
     そのまま画面に出す（wrapSchemaError の分岐には掛からない）。 */
  if (error) throw wrapNewFlowError(wrapSchemaError(wrapMutualRankError(error)));
  return data;
}

/* 相方（既存会員）を会員コードで指定する。
   コードは本人が自分で相手に伝えるもの（マイページの「会員コード」＝紹介コード）。
   返るのは表示名だけで、プロフィールは承認後まで見えない。 */
export async function findPartnerByCode(code) {
  const value = String(code || "").trim().toUpperCase();
  if (!value) throw new Error("会員コードを入力してください。");
  const { data, error } = await supabase.rpc("find_partner_by_code", { p_code: value });
  if (error) throw wrapNewFlowError(error);
  return data;   // { user_id, username }
}

/* 申し込む前の金額の確認（サーバが計算する。表示と実際をずらさないため）。
   自分の残高も一緒に返る（他人の残高は返らない）。 */
export async function getJoinChargePreview(groupSize, payMode) {
  const { data, error } = await supabase.rpc("join_charge_preview", {
    p_size: Number(groupSize) || 1,
    p_mode: [PAY_MODE_SPLIT, PAY_MODE_INVITE].includes(payMode) ? payMode : PAY_MODE_BUNDLE,
  });
  if (error) throw wrapInviteError(error);
  /* { group_size, billable_size, total, per_person,
       discount, discount_when_claimed, my_charge, my_balance }
     ⚠ discount は申し込む時点の割引なので、招待でも 0。
       相方の登録が済んだあとの金額は getMyJoinInvite() の charge が返す。 */
  return data;
}

/* 「招待して呼ぶ」で申し込んだあとに発行される招待リンク。
   コードはテーブルから直接読めない（自分の申し込みの分だけ RPC が返す）。 */
export async function getMyJoinInvite(partyId) {
  const { data, error } = await supabase.rpc("my_join_invite", { p_party: partyId });
  if (error) throw wrapInviteError(error);
  /* { invite_code, claimed, invited_name, total, charge,
       discount_when_claimed, status }
     ⚠ charge は「いまホストが承認したら引かれる額」。相方の登録が
       済むまでは割引が効かないので total と同じ。
     まだ発行していなければ null。 */
  return data ?? null;
}

/* 招待リンクを発行する。**申し込む前に呼んでよい**（これが本来の導線）。
   すでに発行済みなら同じものが返る（何度押しても増えない）。 */
export async function issueJoinInvite(partyId) {
  const { data, error } = await supabase.rpc("issue_join_invite", { p_party: partyId });
  if (error) throw wrapInviteError(error);
  return data;   // { invite_code, claimed, invited_name, total, charge, discount_when_claimed }
}

/* ============== 相方（既存会員）の同意 ==============
   会員コードで指定されただけでは何も起きない。相方本人が
   「3,800pt を払って一緒に参加する」を確認して初めてホストへ届く。
   ⚠ 会員コードは本人が友達に配るものなので、それだけで相手の残高から
     引けたり、当日の席に入れられたりしてはいけない。
   ==================================================== */
export async function listPartnerRequests() {
  const { data, error } = await supabase.rpc("list_partner_requests");
  if (error) throw wrapInviteError(error);
  return data ?? [];   // [{ request_id, party_title, applicant_name, my_charge, ... }]
}

export async function confirmJoinPartner(requestId) {
  const { data, error } = await supabase.rpc("confirm_join_partner", { p_request_id: requestId });
  if (error) throw wrapInviteError(error);
  return data;   // { party_id, already }
}

export async function declineJoinPartner(requestId) {
  const { error } = await supabase.rpc("decline_join_partner", { p_request_id: requestId });
  if (error) throw wrapInviteError(error);
}

/* この会に自分が申し込めるか（会が参加者に求めるランクを満たしているか）。
   引数は会だけ。DB 側は auth.uid() に固定されていて、他人については判定できない。 */
export async function canJoinParty(partyId) {
  const { data, error } = await supabase.rpc("can_join_party", { p_party: partyId });
  if (error) throw wrapMutualRankError(error);
  return data === true;
}

/* 会が参加者に求めるランクの表示。条件が無い会（最下位）では null を返す。 */
export function guestTierLabel(party) {
  if (!party || !hasGuestTierGate(party.min_guest_tier)) return null;
  return rankTier(party.min_guest_tier).label;
}

// この会への自分のリクエスト状態を取得（未送信なら null）
export async function getMyJoinRequest(userId, partyId) {
  const { data, error } = await supabase
    .from("join_requests")
    .select("id, status, group_size, billable_size, pay_mode, partner_status")
    .eq("user_id", userId)
    .eq("party_id", partyId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

// 自分がホストの会に届いた参加リクエスト（受信箱）
// 承認前に閲覧できるのは「代表者のニックネーム」「グループ人数」
// 「代表者のランク（4段階の区分）」のみ。
// 顔写真・年齢・性別・評価の平均点は承認後も／承認後でさえ参照できない。
//
// ランクは join_requests には無い（profiles にあり、申請者はまだ会のメンバー
// ではないので profiles_select でも読めない）。ホストにだけ区分を返す
// list_incoming_request_ranks() で補い、上位のランクから並べる。
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
    .select(
      "id, party_id, group_size, billable_size, pay_mode, partner_status, applicant_name, status, created_at, " +
      "party:party_id(id, title)"
    )
    .in("party_id", ids)
    .eq("status", "pending")
    /* 相方の確認待ちはホストに出さない（2人とも確認してから届く） */
    .in("partner_status", [PARTNER_NONE, PARTNER_CONFIRMED])
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return rows;

  /* ランクが引けなくても受信箱そのものは出す（承認を止めない）。
     migration_mutual_rank.sql が未適用の環境でも動くようにしておく。 */
  let ranks = new Map();
  try {
    const { data: rankRows, error: rErr } = await supabase.rpc("list_incoming_request_ranks");
    if (!rErr) ranks = new Map((rankRows ?? []).map((r) => [r.request_id, r]));
  } catch { /* ランクなしで続行する */ }

  /* 承認するといくら預かるか。招待割が効いているかで変わるが、
     ホストは invited_user_id を読めない（列単位で遮断）ので RPC で聞く。
     ⚠ 返るのは金額と真偽値だけ。招待された方の素性は渡らない。 */
  let charges = new Map();
  try {
    const { data: chargeRows, error: cErr } = await supabase.rpc("list_incoming_request_charges");
    if (!cErr) charges = new Map((chargeRows ?? []).map((r) => [r.request_id, r]));
  } catch { /* 金額は画面側の計算にフォールバックする */ }

  return rows
    .map((r) => {
      const hit = ranks.get(r.id);
      const fee = charges.get(r.id);
      return {
        ...r,
        rank: hit
          ? { tier_key: hit.tier_key, tier_label: hit.tier_label, tier_order: hit.tier_order }
          : null,
        charge: fee?.charge ?? null,
        invite_claimed: fee?.invite_claimed ?? null,
      };
    })
    /* ランクの高い順 → 同じなら申し込みが新しい順 */
    .sort((a, b) =>
      (b.rank?.tier_order ?? 0) - (a.rank?.tier_order ?? 0) ||
      String(b.created_at).localeCompare(String(a.created_at))
    );
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

/* ==================== アプローチ（会へのメッセージ） ====================
   会に参加していない女性ユーザーが、募集中の会のグループチャットへ
   「気になります！」を送れる仕組み。

   個人宛のメッセージ（DM）ではない。送信先はあくまで会（party_id）で、
   本文は既存の messages テーブルにそのまま入る。

   非該当性を保つための担保（すべて DB 側にある。UI で隠しているのではない）:
     ・送った本人は、その会の会話を読めない（自分の送信分だけが見える）
     ・送った本人のプロフィールはホストに公開されない（表示名のみ）
     ・1つの会につき APPROACH_LIMIT 通まで
     ・募集中の会にだけ送れる（マッチ済・終了・取り消しには送れない）
   ==================================================================== */

/* この会にアプローチを送れるか（性別・年齢・ブロック・募集状況をDBで判定） */
export async function canApproachParty(partyId, userId) {
  const { data, error } = await supabase.rpc("can_approach_party", {
    p_party: partyId,
    p_user: userId,
  });
  if (error) throw wrapFeature3Error(error);
  return data === true;
}

/* この会へ自分が送ったアプローチ（相手の会話は含まれない） */
export async function listMyApproaches(partyId, userId) {
  const { data, error } = await supabase
    .from("messages")
    .select("id, content, created_at")
    .eq("party_id", partyId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw wrapFeature3Error(error);
  return data ?? [];
}

/* アプローチを送る。通らない条件は DB のポリシーが弾く。 */
export async function sendApproach(partyId, userId, content) {
  const body = String(content ?? "").trim();
  if (!body) throw new Error("メッセージを入力してください。");
  if (body.length > LIMITS.approach) {
    throw new Error(`メッセージは${LIMITS.approach}文字以内で入力してください。`);
  }
  const { data, error } = await supabase
    .from("messages")
    .insert({ party_id: partyId, user_id: userId, content: body })
    .select("id, content, created_at")
    .single();
  if (error) {
    /* RLS で弾かれたときの 42501 は「新しい行は行レベルセキュリティに違反」
       としか出ないので、利用者に意味の分かる言葉へ置き換える。 */
    if (/row-level security|42501/i.test(error.message || "")) {
      throw new Error(
        "この会にはメッセージを送れませんでした。" +
        `募集が締め切られたか、送信できる上限（${APPROACH_LIMIT}通）に達しています。`
      );
    }
    throw wrapFeature3Error(error);
  }
  return data;
}

/* その会のメンバーが「誰からのアプローチか」を知るための表示名。
   写真・年齢・自己紹介は返らない（参加が承認されるまで非公開のまま）。 */
export async function listApproachSenders(partyId) {
  const { data, error } = await supabase.rpc("list_approach_senders", { p_party: partyId });
  if (error) throw wrapFeature3Error(error);
  return data ?? [];
}

/* ========================== レビュー（内部評価） ==========================
   相席が終わったあと、同じ会にいた相手を5段階＋コメントで評価する。

   ・相手には見えない。自分が付けられた評価も本人には見えない。
   ・運営だけが service_role で全件を読む（内部スコアとして蓄積する）。
   ・同じ会・同じ相手には1回だけ。
   ======================================================================== */
export const REVIEW_RATINGS = [
  { value: 5, label: "とても良かった" },
  { value: 4, label: "良かった" },
  { value: 3, label: "ふつう" },
  { value: 2, label: "少し気になった" },
  { value: 1, label: "問題があった" },
];

/* 会が終わっているか（開催日を過ぎた、または終了扱いになった会） */
export function partyIsOver(party) {
  if (!party || party.status === "cancelled") return false;
  if (party.status === "completed") return true;
  if (!party.party_date) return false;
  const today = toDateString(new Date());
  return String(party.party_date) < today;
}

/* この会で自分が書いたレビュー（相手が書いたものは取得できない） */
export async function listMyReviews(partyId) {
  const { data, error } = await supabase
    .from("user_reviews")
    .select("id, reviewed_id, rating, comment, created_at")
    .eq("party_id", partyId);
  if (error) throw wrapFeature3Error(error);
  return data ?? [];
}

export async function submitReview({ partyId, reviewedId, rating, comment }) {
  const value = Number(rating);
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error("評価を選択してください（1〜5）。");
  }
  const text = trimTo(comment, LIMITS.reviewComment);
  const { data, error } = await supabase
    .from("user_reviews")
    .insert({
      party_id: partyId,
      reviewed_id: reviewedId,
      reviewer_id: (await supabase.auth.getUser()).data?.user?.id,
      rating: value,
      comment: text,
    })
    .select("id, reviewed_id, rating, comment, created_at")
    .single();
  if (error) {
    if (/duplicate key/i.test(error.message || "")) {
      throw new Error("この方の評価は、この会について既に送信済みです。");
    }
    if (/row-level security|42501/i.test(error.message || "")) {
      throw new Error(
        "評価を送れませんでした。評価できるのは、同じ会に参加していた方で、会の開催日を過ぎたあとに限られます。"
      );
    }
    throw wrapFeature3Error(error);
  }
  return data;
}

/* ==================== ランクと予算帯（お店） ====================
   受け取った評価の平均星数でランクが決まる（RANK_TIERS）。
   ランクは主催する側にも参加する側にも効く。

     ・主催するとき … 選べるお店の予算帯の上限
     ・参加するとき … 申し込める会（会ごとの min_guest_tier）

   ⚠ 性別では分けていない。評価も最初から双方向で、同じ会にいた相手なら
     誰から誰へでも書ける。規則は全ユーザー共通。理由は
     supabase/migration_caste_rank.sql と migration_mutual_rank.sql の冒頭。

   ⚠ 見え方（2026-08-25 に一段だけ変えた）:
     ・rank_tier（4段階の区分）は【同じ会に参加が承認されたメンバー】に
       見える。氏名・写真・年齢と同じ範囲で、一覧には出ない。
     ・平均点・件数（review_average / review_count）は【本人だけ】。
       profiles の列単位 SELECT 権限に入っておらず、my_rank() は
       auth.uid() に固定されている。ここは絶対に開けないこと。
     ・個別の評価（点数・コメント・誰が付けたか）は今までどおり誰にも見えない。
   =============================================================== */

/* 自分のランク。引数は取らない（他人の平均点は引けない）。 */
export async function getMyRank() {
  const { data, error } = await supabase.rpc("my_rank");
  if (error) throw wrapRankError(error);
  if (!data) return null;
  const tier = rankTier(data.tier_key);
  return {
    ...data,
    tier,
    /* 次のランクまでに必要なこと（画面の案内用） */
    next: data.next ? { ...data.next, tier: rankTier(data.next.tier_key) } : null,
  };
}

/* 店舗カタログ（shops）から選ぶ方式は廃止した。
   お店の名前とエリアはホストが自由に書く（createParty の location / area）。
   shops テーブルと parties.shop_id は残っているが、画面からは使わない。 */

/* 予算帯の表示（会のカード・詳細で使う）。会の属性であって個人の属性ではない。 */
export function budgetLabel(party) {
  if (!party) return null;
  if (party.avg_budget) return `お一人 約${Number(party.avg_budget).toLocaleString()}円`;
  const tier = party.budget_tier ? rankTier(party.budget_tier) : null;
  return tier ? `お一人 ${tier.budgetLabel}` : null;
}

/* migration_caste_rank.sql が未適用のときに分かりやすいエラーへ変換する */
function wrapRankError(error) {
  const msg = error?.message || "";
  if (/my_rank|rank_tier|shops|budget_tier|avg_budget|schema cache/i.test(msg)) {
    return new Error(
      "この機能に必要なデータベースの更新がまだ適用されていません。" +
      "supabase/migration_caste_rank.sql を実行してください。"
    );
  }
  return error;
}

/* migration_mutual_rank.sql が未適用のときに分かりやすいエラーへ変換する */
function wrapMutualRankError(error) {
  const msg = error?.message || "";
  if (/can_join_party|min_guest_tier|list_incoming_request_ranks|schema cache/i.test(msg)) {
    return new Error(
      "この機能に必要なデータベースの更新がまだ適用されていません。" +
      "supabase/migration_mutual_rank.sql を実行してください。"
    );
  }
  return error;
}

/* migration_reviews_approach_style.sql が未適用のときに分かりやすいエラーへ変換する */
function wrapFeature3Error(error) {
  const msg = error?.message || "";
  if (/user_reviews|drinking_style|can_approach_party|list_approach_senders|my_gender|party_is_over|host_drinking_style|schema cache/i.test(msg)) {
    return new Error(
      "この機能に必要なデータベースの更新がまだ適用されていません。" +
      "supabase/migration_reviews_approach_style.sql を実行してください。"
    );
  }
  return error;
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
        body:
          `${r.applicant_name || "ゲスト"}さん` +
          (r.group_size === 1 ? "（お一人）" : `のグループ（${r.group_size}名）`) +
          `から「${titleOf.get(r.party_id) ?? "会"}」への参加希望`,
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
    /* 会ごとに最新の1件だけを通知にする（連投で埋まらないようにする）。
       会に参加していない方からのアプローチはプロフィールが引けない
       （承認前は非公開のため profiles が null になる）ので、
       「アプローチ」として別の見出しで出す。 */
    const seenParty = new Set();
    for (const m of msgs ?? []) {
      if (seenParty.has(m.party_id)) continue;
      seenParty.add(m.party_id);
      const approach = !m.profiles;
      items.push({
        id: `msg-${m.id}`,
        type: approach ? "approach" : "message",
        at: m.created_at,
        partyId: m.party_id,
        chat: true,
        title: approach
          ? "あなたの会にメッセージが届きました"
          : `${m.profiles?.username || "メンバー"}さんからメッセージ`,
        body: m.content.length > 60 ? `${m.content.slice(0, 60)}…` : m.content,
      });
    }
  }

  items.sort((a, b) => new Date(b.at) - new Date(a.at));
  return items.slice(0, 30);
}

/* =========================== ブロック ===========================
   ブロックすると、相手が主催する会は一覧・詳細から消え、
   相手の会へ参加を申し込むこともできなくなる（逆向きも同じ）。

   すでに同じ会に参加が承認されているグループチャットは残す。
   当日の待ち合わせの最中に会話が消えると、かえって困るため。
   その場合は通報（お問い合わせ画面）からの対応になる。
   ================================================================ */
export async function blockUser(userId, reason) {
  const { error } = await supabase
    .from("blocks")
    .insert({ blocked_id: userId, reason: trimTo(reason, 200) });
  if (error) {
    if (/duplicate key/i.test(error.message || "")) return;   // すでにブロック済み
    throw wrapLaunch2Error(error);
  }
}

export async function unblockUser(userId) {
  const { error } = await supabase.from("blocks").delete().eq("blocked_id", userId);
  if (error) throw wrapLaunch2Error(error);
}

export async function listBlocks() {
  const { data, error } = await supabase.rpc("my_blocks");
  if (error) throw wrapLaunch2Error(error);
  return data ?? [];
}

/* ========================= 友達紹介 =========================
   自分の招待コードを友達に渡し、友達が登録後にそのコードを
   入力すると、双方に REFERRAL_BONUS が入る。
   コードは総当たりされないよう RPC 経由でのみ返す。
   ============================================================ */
export async function getReferralStats() {
  const { data, error } = await supabase.rpc("my_referral_stats");
  if (error) throw wrapLaunch2Error(error);
  return data ?? null;   // { code, count, used, bonus }
}

export async function applyReferralCode(code) {
  const value = String(code || "").trim().toUpperCase();
  if (!value) throw new Error("招待コードを入力してください。");
  const { data, error } = await supabase.rpc("apply_referral_code", { p_code: value });
  if (error) throw wrapLaunch2Error(error);
  return data;           // { bonus, host_name }
}

/* 招待の共有文面。SNS・メッセージアプリのどれに貼っても成立する短さにする。 */
export function referralShareText(code) {
  const url = typeof window === "undefined" ? "https://aiseki.jp" : window.location.origin;
  return (
    "AISEKI（大人のグループ相席）に一緒に登録しませんか。\n" +
    `招待コード「${code}」を入れると、二人とも${REFERRAL_BONUS.toLocaleString()}ptもらえます。\n` +
    url
  );
}

/* migration_launch2.sql が未適用のときに分かりやすいエラーへ変換する */
function wrapLaunch2Error(error) {
  const msg = error?.message || "";
  if (/blocks|my_blocks|is_blocked|referral|photos|hobbies|party_date|does not exist|schema cache/i.test(msg)) {
    return new Error(
      "この機能に必要なデータベースの更新がまだ適用されていません。" +
      "supabase/migration_launch2.sql を実行してください。"
    );
  }
  return error;
}

/* ======================= 決済が使えるか =======================
   Stripe のキーが未設定のあいだは、購入ボタンを押しても
   503 が返るだけになる。先に確認して画面に「準備中」と出す。
   /api が無い環境（vite dev）では HTML が返るので、
   JSON でない時点で「準備中」と判断する。
   ============================================================ */
/* 同じ画面で2回聞かないよう、最初の1回だけ問い合わせて使い回す。 */
let stripeStatusPromise = null;

export function stripeStatus() {
  stripeStatusPromise ??= (async () => {
    try {
      const res = await fetch("/api/stripe/status", { headers: { accept: "application/json" } });
      if (!res.headers.get("content-type")?.includes("application/json")) {
        return { enabled: false, cardEnabled: false, publishableKey: null, captchaSiteKey: null };
      }
      const body = await res.json();
      return {
        enabled: body?.enabled === true,
        cardEnabled: body?.cardEnabled === true,
        publishableKey: body?.publishableKey || null,
        captchaSiteKey: body?.captchaSiteKey || null,
      };
    } catch {
      return { enabled: false, cardEnabled: false, publishableKey: null, captchaSiteKey: null };
    }
  })();
  return stripeStatusPromise;
}

/* ==================== カード登録（5,000pt） ====================
   ・カード番号はブラウザから Stripe へ直接送る（AISEKI は受け取らない）。
   ・ポイントを付けるのはサーバだけ。ここから残高は増やせない
     （grant_card_bonus は service_role 専用）。
   ============================================================== */

/* 自分がカードを登録済みか。他人の分は取得できない（RPC が auth.uid() で固定）。 */
export async function isCardRegistered() {
  const { data, error } = await supabase.rpc("my_card_registered");
  if (error) throw wrapCardBonusError(error);
  return data === true;
}

/* migration_card_bonus.sql が未適用のときに分かりやすいエラーへ変換する */
function wrapCardBonusError(error) {
  const msg = error?.message || "";
  if (/my_card_registered|card_registered|grant_card_bonus|does not exist|schema cache/i.test(msg)) {
    return new Error(
      "この機能に必要なデータベースの更新がまだ適用されていません。" +
      "supabase/migration_card_bonus.sql を実行してください。"
    );
  }
  return error;
}

/* Stripe.js（index.html の <script>）を待って、公開可能キーで初期化する。
   キーはサーバ（/api/stripe/status）から受け取った値を優先する。
   ビルド時に焼き込む VITE_ の値は、--prebuilt デプロイで
   空のまま出てしまうことがあるため（LAUNCH.md 参照）。 */
let stripeJs = null;

export async function loadStripe(publishableKey) {
  const key =
    publishableKey ||
    (await stripeStatus()).publishableKey ||
    import.meta.env?.VITE_STRIPE_PUBLISHABLE_KEY ||
    "";
  if (!key) throw new Error("カード決済の準備ができていません。");

  const Stripe = await waitForStripeJs();
  stripeJs ??= Stripe(key);
  return stripeJs;
}

function waitForStripeJs(timeoutMs = 10000) {
  if (typeof window === "undefined") return Promise.reject(new Error("ブラウザでのみ利用できます。"));
  if (window.Stripe) return Promise.resolve(window.Stripe);

  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (window.Stripe) { clearInterval(timer); resolve(window.Stripe); return; }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error("カード入力の読み込みに失敗しました。通信環境をご確認ください。"));
      }
    }, 60);
  });
}

/* /api を呼ぶ共通処理。vite dev（npm run dev）には /api が無く HTML が返るので、
   JSON でない時点で「決済APIに届いていない」と分かる。 */
async function callPaymentApi(path, body) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("ログインが必要です。");

  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.headers.get("content-type")?.includes("application/json")) {
    throw new Error("決済APIに接続できませんでした。ローカルでは `vercel dev` で起動してください。");
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(payload?.error || "通信に失敗しました。");
    // CAPTCHA で弾かれたときは、画面がウィジェットを描き直せるように印を残す。
    if (payload?.captcha) err.captcha = true;
    /* 既に別のアカウントで登録済みのカードだった（カード1枚につき1回）。
       カードの登録自体は済んでいるので、画面は「失敗」ではなく
       専用の案内を出す。 */
    if (payload?.duplicateCard) err.duplicateCard = true;
    throw err;
  }
  return payload;
}

/* CAPTCHA（Turnstile）のサイトキー。サーバから受け取る値を優先する。
   ビルド時に焼き込む VITE_ の値は --prebuilt デプロイで空になることがあるため
   （HANDOFF §15。公開可能キーと同じ扱い）。 */
export async function captchaSiteKey() {
  const fromServer = (await stripeStatus()).captchaSiteKey;
  return fromServer || import.meta.env?.VITE_TURNSTILE_SITE_KEY || "";
}

/* カード登録用の SetupIntent を作る。返るのは client_secret。
   🚨 CAPTCHA のトークンが要る。サーバが Cloudflare に問い合わせて
     検証し、通ったものにだけ印を押す（＝ボーナスが付く条件）。 */
export async function createSetupIntent(captchaToken) {
  return callPaymentApi("/api/stripe/setup-intent", { captchaToken });
}

/* 登録できたことをサーバに確かめてもらい、ボーナスを受け取る。
   実際に付与するかどうかを決めるのはサーバ（Stripe に問い合わせて確認する）。
   Webhook から先に付与されていれば granted=false が返る（二重には付かない）。 */
export async function confirmCardRegistration(setupIntentId) {
  return callPaymentApi("/api/stripe/confirm-card", { setupIntentId });
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
