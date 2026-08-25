/* 追加した3機能を本番スキーマに対して実際に叩いて確かめる。
   作ったユーザーは最後に必ず消す（--keep で残せる）。 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ROOT = "/Users/ayukiyamazaki/Developer/aiseki";
const env = Object.fromEntries(
  readFileSync(`${ROOT}/.env`, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) throw new Error("接続情報が足りません");

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const stamp = Date.now();
const made = [];

async function makeUser(tag, gender) {
  const email = `theoffzaki+aiseki${stamp}${tag}@gmail.com`;
  const password = "Test123456!";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: `テスト${tag}`, birth_date: "1994-05-05", gender },
  });
  if (error) throw new Error(`${tag} の作成に失敗: ${error.message}`);
  made.push(data.user.id);
  const client = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw new Error(`${tag} のログインに失敗: ${e2.message}`);
  return { id: data.user.id, client, email };
}

const dateStr = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

try {
  const host = await makeUser("host", "男性");
  const guest = await makeUser("guest", "男性");
  const woman = await makeUser("woman", "女性");
  const man = await makeUser("man", "男性");
  console.log("テストユーザーを4名作成しました\n");

  /* ── 0. 性別がトリガー経由で保存されているか ── */
  {
    const { data } = await admin.from("profiles").select("id, gender").in("id", made);
    const map = Object.fromEntries(data.map((r) => [r.id, r.gender]));
    ok("登録時の性別が profiles に入る", map[woman.id] === "女性" && map[host.id] === "男性", JSON.stringify(Object.values(map)));
  }

  /* ── 1. 飲みスタイルタグ ── */
  {
    const { error } = await host.client
      .from("profiles")
      .update({ drinking_style: ["オールナイトOK", "2件目OK"] })
      .eq("id", host.id);
    ok("飲みスタイルタグを保存できる", !error, error?.message ?? "");

    const { error: bad } = await host.client
      .from("profiles")
      .update({ drinking_style: ["存在しないタグ"] })
      .eq("id", host.id);
    ok("選択肢に無いタグは保存できない", !!bad, bad?.message?.slice(0, 60) ?? "通ってしまった");

    const { error: many } = await host.client
      .from("profiles")
      .update({ drinking_style: ["オールナイトOK", "2件目OK", "まったり派", "ガンガン飲む派", "食事メイン"] })
      .eq("id", host.id);
    ok("上限（4個）を超えるタグは保存できない", !!many, many?.message?.slice(0, 60) ?? "通ってしまった");
  }

  /* ── 2. 性別は変更できない／他人からは読めない ── */
  {
    const { error } = await host.client.from("profiles").update({ gender: "女性" }).eq("id", host.id);
    ok("性別はあとから変更できない", !!error, error?.message?.slice(0, 60) ?? "変更できてしまった");

    const { data } = await host.client.rpc("my_gender");
    ok("自分の性別は my_gender() で読める", data === "男性", String(data));

    const { error: colErr } = await host.client.from("profiles").select("gender").eq("id", host.id);
    ok("gender 列の直接 SELECT は遮断されている", !!colErr, colErr?.message?.slice(0, 50) ?? "読めてしまった");
  }

  /* ── 3. 会を作る（開催日は明日） ── */
  const { data: party, error: pErr } = await host.client
    .from("parties")
    .insert({
      /* ⚠ status / room_type / point_request / treat_type / max_members /
         current_members は送らない。migration_security_hardening.sql（2026-08-23）
         が parties の INSERT を「会を作るときに必要な列」だけに絞ったため、
         権限の無い列を1つでも積むと insert 全体が
         42501 permission denied for table parties で落ちる（HANDOFF §14）。
         値は DB の既定値と enforce_group_party() が確定させる。 */
      host_id: host.id, title: `テスト会${stamp}`, area: "渋谷", location: "テスト店",
      host_group_size: 2, guest_group_size: 2, host_member_names: ["同伴A"],
      party_date: dateStr(1), party_time: "20:00",
    })
    .select()
    .single();
  if (pErr) throw new Error("会の作成に失敗: " + pErr.message);
  ok("会の作成時にホストの飲みスタイルが写る",
    JSON.stringify(party.host_drinking_style) === JSON.stringify(["オールナイトOK", "2件目OK"]),
    JSON.stringify(party.host_drinking_style));

  /* プロフィールのタグを変えると募集中の会にも反映される */
  {
    await host.client.from("profiles").update({ drinking_style: ["まったり派"] }).eq("id", host.id);
    const { data: after } = await admin.from("parties").select("host_drinking_style").eq("id", party.id).single();
    ok("タグを変えると募集中の会にも反映される",
      JSON.stringify(after.host_drinking_style) === JSON.stringify(["まったり派"]),
      JSON.stringify(after.host_drinking_style));
    // 元に戻す
    await host.client.from("profiles").update({ drinking_style: ["オールナイトOK", "2件目OK"] }).eq("id", host.id);
  }

  /* 一覧（未ログインでない一般ユーザー）からタグが見えるか */
  {
    const { data } = await man.client.from("parties").select("id, host_drinking_style").eq("id", party.id).single();
    ok("会の一覧からホストのタグが見える", (data?.host_drinking_style?.length ?? 0) === 2, JSON.stringify(data?.host_drinking_style));
  }

  /* ── 4. アプローチ ── */
  {
    const { data: canW } = await woman.client.rpc("can_approach_party", { p_party: party.id, p_user: woman.id });
    ok("女性ユーザーはアプローチできる", canW === true, String(canW));

    const { data: canM } = await man.client.rpc("can_approach_party", { p_party: party.id, p_user: man.id });
    ok("男性ユーザーはアプローチできない", canM === false, String(canM));

    const { data: canH } = await host.client.rpc("can_approach_party", { p_party: party.id, p_user: host.id });
    ok("ホスト自身はアプローチ対象外", canH === false, String(canH));

    /* 他人の UUID を渡して性別を探れないこと。
       ここが true を返すと「その人は女性」と分かってしまう（UUID は
       同じ会の party_members から読める）。必ず false でなければならない。 */
    const { data: probe } = await man.client.rpc("can_approach_party", { p_party: party.id, p_user: woman.id });
    ok("他人の UUID を渡しても性別を探れない", probe === false, String(probe));

    const { error: sendErr } = await woman.client
      .from("messages")
      .insert({ party_id: party.id, user_id: woman.id, content: "気になります！" });
    ok("女性ユーザーが募集中の会にメッセージを送れる", !sendErr, sendErr?.message?.slice(0, 70) ?? "");

    const { error: manErr } = await man.client
      .from("messages")
      .insert({ party_id: party.id, user_id: man.id, content: "送れないはず" });
    ok("参加していない男性ユーザーは送れない", !!manErr, manErr?.message?.slice(0, 50) ?? "送れてしまった");

    /* ホストが会話を書く → 送信者にはそれが見えないこと */
    await host.client.from("messages").insert({ party_id: party.id, user_id: host.id, content: "ホストの内輪の発言" });

    const { data: womanSees } = await woman.client.from("messages").select("id, content").eq("party_id", party.id);
    ok("送信者に会の会話は見えない（自分の分だけ）",
      womanSees?.length === 1 && womanSees[0].content === "気になります！",
      `${womanSees?.length}件: ${womanSees?.map((m) => m.content).join(" / ")}`);

    const { data: hostSees } = await host.client.from("messages").select("id").eq("party_id", party.id);
    ok("ホストは両方読める", hostSees?.length === 2, `${hostSees?.length}件`);

    /* 送信者のプロフィールはホストに公開されない。名前だけ RPC で返る */
    const { data: prof } = await host.client.from("profiles").select("id, username, age").eq("id", woman.id).maybeSingle();
    ok("送信者のプロフィールはホストに公開されない", !prof, prof ? JSON.stringify(prof) : "非公開");

    const { data: senders } = await host.client.rpc("list_approach_senders", { p_party: party.id });
    ok("ホストは送信者の表示名だけ取得できる",
      senders?.length === 1 && senders[0].user_id === woman.id && senders[0].username === "テストwoman",
      JSON.stringify(senders));

    const { data: sendersForOther } = await man.client.rpc("list_approach_senders", { p_party: party.id });
    ok("会のメンバーでない人は送信者一覧を取れない", (sendersForOther?.length ?? 0) === 0, JSON.stringify(sendersForOther));

    /* 上限（5通） */
    for (let i = 2; i <= 5; i++) {
      await woman.client.from("messages").insert({ party_id: party.id, user_id: woman.id, content: `${i}通目` });
    }
    const { error: overErr } = await woman.client
      .from("messages")
      .insert({ party_id: party.id, user_id: woman.id, content: "6通目" });
    ok("1つの会につき5通までで打ち止め", !!overErr, overErr?.message?.slice(0, 50) ?? "6通目が通ってしまった");
  }

  /* ── 5. 参加 → 承認 → 会の終了 → 評価 ── */
  {
    const { error: jErr } = await guest.client.from("join_requests").insert({
      user_id: guest.id, party_id: party.id, group_size: 2, member_names: ["同伴B"], status: "pending",
    });
    if (jErr) throw new Error("参加リクエストに失敗: " + jErr.message);
    const { data: req } = await admin.from("join_requests").select("id").eq("party_id", party.id).single();
    const { error: aErr } = await host.client.rpc("accept_join_request", { p_request_id: req.id });
    if (aErr) throw new Error("承認に失敗: " + aErr.message);
    ok("参加リクエストの承認は今までどおり通る", true);

    /* マッチ済になるとアプローチは送れなくなる */
    const { data: canAfter } = await woman.client.rpc("can_approach_party", { p_party: party.id, p_user: woman.id });
    ok("満席（マッチ済）になるとアプローチできない", canAfter === false, String(canAfter));

    /* 開催前は評価できない */
    const { error: earlyErr } = await guest.client.from("user_reviews").insert({
      party_id: party.id, reviewer_id: guest.id, reviewed_id: host.id, rating: 5, comment: "早すぎる",
    });
    ok("開催日前は評価できない", !!earlyErr, earlyErr?.message?.slice(0, 50) ?? "通ってしまった");

    /* 開催日を過去にして終了状態にする */
    await admin.from("parties").update({ party_date: dateStr(-1) }).eq("id", party.id);

    const { data: over } = await guest.client.rpc("party_is_over", { p_party: party.id });
    ok("開催日を過ぎた会は「終了」と判定される", over === true, String(over));

    const { data: rev, error: rErr } = await guest.client.from("user_reviews").insert({
      party_id: party.id, reviewer_id: guest.id, reviewed_id: host.id, rating: 4, comment: "楽しかったです",
    }).select().single();
    ok("終了後は同じ会のメンバーを評価できる", !rErr && !!rev, rErr?.message?.slice(0, 70) ?? "");

    const { error: dupErr } = await guest.client.from("user_reviews").insert({
      party_id: party.id, reviewer_id: guest.id, reviewed_id: host.id, rating: 1,
    });
    ok("同じ会・同じ相手への二重評価は弾かれる", !!dupErr, dupErr?.message?.slice(0, 40) ?? "通ってしまった");

    const { error: selfErr } = await guest.client.from("user_reviews").insert({
      party_id: party.id, reviewer_id: guest.id, reviewed_id: guest.id, rating: 5,
    });
    ok("自分自身は評価できない", !!selfErr, selfErr?.message?.slice(0, 40) ?? "通ってしまった");

    const { error: badRating } = await guest.client.from("user_reviews").insert({
      party_id: party.id, reviewer_id: guest.id, reviewed_id: host.id, rating: 6,
    });
    ok("1〜5以外の点数は保存できない", !!badRating, badRating?.message?.slice(0, 40) ?? "通ってしまった");

    const { error: outsiderErr } = await man.client.from("user_reviews").insert({
      party_id: party.id, reviewer_id: man.id, reviewed_id: host.id, rating: 1,
    });
    ok("会にいなかった人は評価できない", !!outsiderErr, outsiderErr?.message?.slice(0, 40) ?? "通ってしまった");

    /* 相手には見えない */
    const { data: hostSeesReviews } = await host.client.from("user_reviews").select("id").eq("party_id", party.id);
    ok("評価された本人には見えない", (hostSeesReviews?.length ?? 0) === 0, `${hostSeesReviews?.length}件`);

    const { data: mine } = await guest.client.from("user_reviews").select("id, rating, comment").eq("party_id", party.id);
    ok("自分が書いた評価だけは自分で読める", mine?.length === 1 && mine[0].rating === 4, JSON.stringify(mine));

    /* 書き換え・削除ができないこと */
    const { data: upd } = await guest.client.from("user_reviews").update({ rating: 1 }).eq("id", rev.id).select();
    ok("送信した評価は書き換えられない", (upd?.length ?? 0) === 0, JSON.stringify(upd));
    const { data: del } = await guest.client.from("user_reviews").delete().eq("id", rev.id).select();
    ok("送信した評価は削除できない", (del?.length ?? 0) === 0, JSON.stringify(del));

    /* 運営（service_role）は集計を読める */
    const { data: scores } = await admin.from("user_review_scores").select("*").eq("reviewed_id", host.id);
    ok("運営は内部スコアを集計で読める", scores?.length === 1 && Number(scores[0].average_rating) === 4, JSON.stringify(scores));

    const { error: viewErr } = await guest.client.from("user_review_scores").select("*");
    ok("利用者は集計ビューを読めない", !!viewErr, viewErr?.message?.slice(0, 40) ?? "読めてしまった");
  }

  /* ── 6. 既存機能が壊れていないこと ── */
  {
    const { data: members, error } = await guest.client
      .from("party_members")
      .select("id, user_id, profiles!party_members_user_id_fkey(username, drinking_style)")
      .eq("party_id", party.id);
    ok("参加メンバーとプロフィールの埋め込みは今までどおり動く",
      !error && (members?.length ?? 0) === 4,
      error?.message?.slice(0, 60) ?? `${members?.length}席`);
    const hostRow = members?.find((m) => m.user_id === host.id);
    ok("承認後はメンバーの飲みスタイルが見える",
      (hostRow?.profiles?.drinking_style?.length ?? 0) === 2,
      JSON.stringify(hostRow?.profiles?.drinking_style));
  }
} catch (e) {
  ok("テストの実行", false, e.message);
} finally {
  if (!process.argv.includes("--keep")) {
    for (const id of made) await admin.auth.admin.deleteUser(id).catch(() => {});
    console.log(`\n後片付け: テストユーザー ${made.length}件を削除しました`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== ${results.length - failed.length}/${results.length} 件 成功 ===`);
  if (failed.length) {
    console.log("失敗:");
    failed.forEach((f) => console.log(`  ・${f.name} — ${f.detail}`));
    process.exitCode = 1;
  }
}
