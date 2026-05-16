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
        .limit(24),
    ]);

    if (!profile) throw new Error("프로필을 찾을 수 없습니다.");
    if (!event) return Response.json({ ok: true, skipped: "active_event_missing" }, { headers: corsHeaders });

    const system = [
      "너는 한국어 웹 TRPG의 공정하고 재밌는 게임마스터다.",
      "플레이어의 한 줄 행동을 받아, 장면을 앞으로 움직이는 판정을 만든다.",
      "핵심 원칙:",
      "1. 플레이어 의도를 존중하되, 비용/위험/단서를 함께 제시한다.",
      "2. 같은 문장을 반복하지 않는다.",
      "3. 즉사, 무의미한 실패, 아무 변화 없음 판정을 남발하지 않는다.",
      "4. 성공해도 새 문제가 생기고, 실패해도 새 단서나 선택지가 생기게 한다.",
      "5. 최근 대화와 현재 이벤트의 규칙을 이어받아 개연성을 지킨다.",
      "6. 결과는 3~6문장. 감각 묘사, 구체적 변화, 다음에 할 수 있는 선택지를 포함한다.",
      "7. 행동이 너무 장난이어도 세계가 반응하게 하되, 세션 분위기를 완전히 깨지 않는다.",
      "8. HP 변화는 정말 위험하거나 회복이 있을 때만 사용한다. 보통은 0.",
      "반드시 JSON만 반환한다.",
    ].join("\n");
    const verdict =
      (await openAIJson<VerdictPayload>(system, {
        event: {
          title: event.title,
          scene: event.scene,
          stakes: event.stakes,
          tone: event.tone,
          log: Array.isArray(event.log) ? event.log.slice(-10) : [],
        },
        recent_messages: (recentMessages || []).reverse(),
        player: profile.nickname,
        action,
        judgment_style: {
          result_length: "3~6 Korean sentences",
          must_include: ["행동의 직접 결과", "상황 변화", "새 단서 또는 다음 선택지"],
          avoid: ["아무 변화 없음", "반복 문장", "근거 없는 즉사", "플레이어 행동 무시"],
        },
        schema: {
          result: "플레이어에게 보여줄 판정 결과",
          hp_delta: "정수. 피해는 음수, 회복은 양수, 변화 없으면 0",
          status: "상태 변화. 없으면 빈 문자열",
          world_change: "세계/장면 변화 요약",
        },
      })) || fallbackVerdict(profile.nickname, action);

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
