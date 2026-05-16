import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { fallbackVerdict, openAIJson, VerdictPayload } from "../_shared/gm.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) throw new Error("로그인이 필요합니다.");

    const { room_id, action } = await req.json();
    if (!room_id || !action) throw new Error("room_id와 action이 필요합니다.");

    const supabase = createClient(url, serviceKey);
    const [{ data: profile }, { data: event }, { data: recentMessages }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userData.user.id).single(),
      supabase
        .from("events")
        .select("*")
        .eq("room_id", room_id)
        .eq("active", true)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("messages")
        .select("nickname,kind,text,created_at")
        .eq("room_id", room_id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    if (!profile) throw new Error("프로필을 찾을 수 없습니다.");
    if (!event) return Response.json({ ok: true, skipped: "active_event_missing" }, { headers: corsHeaders });

    const system = [
      "너는 한국어 웹 TRPG 게임마스터다.",
      "플레이어 행동을 현재 사건에 맞게 즉시 판정한다.",
      "반복 금지. 무변화 금지. 즉사 남발 금지.",
      "결과는 2~3문장으로 짧게: 직접 결과, 상황 변화, 다음 선택지를 포함한다.",
      "HP 변화는 위험/회복이 명확할 때만 사용한다. 보통은 0.",
      "반드시 JSON만 반환한다.",
    ].join("\n");
    const verdict =
      (await openAIJson<VerdictPayload>(system, {
        event: {
          title: event.title,
          scene: event.scene,
          stakes: event.stakes,
          tone: event.tone,
          log: Array.isArray(event.log) ? event.log.slice(-5) : [],
        },
        recent_messages: (recentMessages || []).reverse(),
        player: profile.nickname,
        action,
        judgment_style: {
          result_length: "2~3 Korean sentences",
          must_include: ["행동의 직접 결과", "상황 변화", "새 단서 또는 다음 선택지"],
          avoid: ["아무 변화 없음", "반복 문장", "근거 없는 즉사", "플레이어 행동 무시"],
        },
        schema: {
          result: "플레이어에게 보여줄 판정 결과",
          hp_delta: "정수. 피해는 음수, 회복은 양수, 변화 없으면 0",
          status: "상태 변화. 없으면 빈 문자열",
          world_change: "세계/장면 변화 요약",
        },
      })) || fallbackVerdict(profile.nickname, action, event);

    const nextHp = Math.max(0, Math.min(100, Number(profile.hp || 100) + Number(verdict.hp_delta || 0)));
    const profilePatch: Record<string, unknown> = { hp: nextHp };
    if (verdict.status) profilePatch.status = verdict.status;

    await supabase.from("profiles").update(profilePatch).eq("id", profile.id);
    await supabase
      .from("events")
      .update({
        log: [
          ...(Array.isArray(event.log) ? event.log : []),
          {
            nickname: profile.nickname,
            action,
            result: verdict.result,
            world_change: verdict.world_change,
            created_at: new Date().toISOString(),
          },
        ],
      })
      .eq("id", event.id);

    const { error: messageError } = await supabase.from("messages").insert({
      room_id,
      nickname: "GM",
      kind: "gm",
      text: verdict.result,
      meta: verdict,
    });
    if (messageError) throw messageError;

    return Response.json({ ok: true, verdict }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ ok: false, error: String(error.message || error) }, { status: 400, headers: corsHeaders });
  }
});
