import { supabase } from "./supabase";

/* =====================================================================
   グループ限定マッチングの共通ルール
   ・1つの会は「ホスト側2名以上」×「参加側2名以上」でのみ成立する（1対1は不可）
   ・個人プロフィールは同じ会に参加承認された相手にのみ公開（RLSで担保）
   ===================================================================== */
export const MIN_GROUP_SIZE = 2;

// マイグレーション未適用（新カラム・新RPCが無い）場合に分かりやすいエラーへ変換する
function wrapSchemaError(error) {
  const msg = error?.message || "";
  if (/host_member_names|member_names|group_owner_id|display_name|invite_code|claim_seat|list_my_seats|side/.test(msg)) {
    return new Error(
      "データベースがグループメンバー登録の仕様に更新されていません。" +
      "Supabase の SQL Editor で supabase/migration_group_members.sql を実行してください。"
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
// 18歳未満は利用禁止。性別は登録時に一切収集しない（性別による制限を設けないため）。
export const MIN_AGE = 18;

export async function signUp({ email, password, username, age }) {
  if (!(Number(age) >= MIN_AGE)) {
    throw new Error(`本サービスは${MIN_AGE}歳未満の方はご利用いただけません。`);
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username, age: String(age) } },
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

/* ========================== Profile ========================== */
export async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProfile(userId, fields) {
  const { data, error } = await supabase
    .from("profiles")
    .update(fields)
    .eq("id", userId)
    .select()
    .single();
  if (error) throw error;
  return data;
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

// ポイント購入（自分の残高に加算）。残高更新は security definer RPC 経由。
export async function purchasePoints(amount, description) {
  const { data, error } = await supabase.rpc("purchase_points", {
    p_amount: amount,
    p_description: description,
  });
  if (error) throw error;
  return data; // 新しい残高
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
export async function getPartyMembers(partyId) {
  const { data, error } = await supabase
    .from("party_members")
    .select("id, role, side, group_owner_id, display_name, joined_at, user_id, profiles(username, avatar_url, age)")
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

// 会の作成。ホスト側・参加側ともに2名以上のグループが必須（1対1は作成不可）。
// 同伴者の席はサーバ側（handle_new_party → create_group_seats）で人数分作られる。
// 実際の人数・定員はサーバ側トリガーが確定させる。
export async function createParty(hostId, fields) {
  const hostGroup = Number(fields.host_group_size);
  const guestGroup = Number(fields.guest_group_size);
  if (!(hostGroup >= MIN_GROUP_SIZE) || !(guestGroup >= MIN_GROUP_SIZE)) {
    throw new Error(`会は${MIN_GROUP_SIZE}名以上のグループ同士でのみ作成できます。`);
  }
  const { host_member_names, ...rest } = fields;
  const { data, error } = await supabase
    .from("parties")
    .insert({
      host_id: hostId,
      status: "recruiting",
      ...rest,
      host_group_size: hostGroup,
      guest_group_size: guestGroup,
      host_member_names: normalizeMemberNames(host_member_names, hostGroup),
      max_members: hostGroup + guestGroup,
      current_members: hostGroup,
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
// グループ単位の参加リクエスト（募集側＝ホストは無料。ポイントは承認時に移動）
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
    .select("id, party_id, group_size, applicant_name, status, created_at, party:party_id(id, title, point_request)")
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
export async function listMessages(partyId) {
  const { data, error } = await supabase
    .from("messages")
    .select("*, profiles(username, avatar_url)")
    .eq("party_id", partyId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function sendMessage(partyId, userId, content) {
  const { data, error } = await supabase
    .from("messages")
    .insert({ party_id: partyId, user_id: userId, content })
    .select("*, profiles(username, avatar_url)")
    .single();
  if (error) throw error;
  return data;
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
