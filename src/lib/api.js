import { supabase } from "./supabase";

/* ============================ Auth ============================ */
export async function signUp({ email, password, username, gender, age }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username, gender, age: age ? String(age) : "" } },
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
export async function listParties(area) {
  let q = supabase
    .from("parties")
    .select("*, host:host_id(username, gender, age)")
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
    .select("*, host:host_id(username, gender, age)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function getPartyMembers(partyId) {
  const { data, error } = await supabase
    .from("party_members")
    .select("role, joined_at, user_id, profiles(username, avatar_url, age, gender)")
    .eq("party_id", partyId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createParty(hostId, fields) {
  const { data, error } = await supabase
    .from("parties")
    .insert({ host_id: hostId, current_members: 1, status: "recruiting", ...fields })
    .select()
    .single();
  if (error) throw error;
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
// 参加者が会に参加リクエストを送る（募集側＝ホストは無料。ポイントは承認時に移動）
export async function sendJoinRequest(userId, partyId) {
  const { data, error } = await supabase
    .from("join_requests")
    .insert({ user_id: userId, party_id: partyId, status: "pending" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// この会への自分のリクエスト状態を取得（未送信なら null）
export async function getMyJoinRequest(userId, partyId) {
  const { data, error } = await supabase
    .from("join_requests")
    .select("id, status")
    .eq("user_id", userId)
    .eq("party_id", partyId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

// 自分がホストの会に届いた参加リクエスト（受信箱）
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
    .select("*, applicant:user_id(username, avatar_url, age, gender), party:party_id(id, title, point_request)")
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

/* ========================= Messages ========================== */
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
