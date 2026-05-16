import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { EventPayload, fallbackEvent, openAIJson } from "../_shared/gm.ts";

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

    const { room_id, prompt } = await req.json();
    if (!room_id) throw new Error("room_id가 필요합니다.");

    const adminClient = createClient(url, serviceKey);
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("is_admin")
      .eq("id", userData.user.id)
      .single();
    if (profileError || !profile?.is_admin) throw new Error("관리자만 이벤트를 시작할 수 있습니다.");

    const system = [
      "너는 한국어 웹 TRPG 게임마스터다.",
      "현실적 장소+초현실 규칙이 있는 새 사건을 만든다.",
      "장르를 섞어라: 생존호러, 도시괴담, 오컬트, 재난, 추리, 블랙코미디, 민속공포, 시간루프.",
      "플레이어가 바로 행동할 수 있게 위협, 단서, 목표를 넣어라.",
      "결말을 정하지 말고 다음 행동 여지를 남겨라.",
      "반드시 JSON만 반환한다.",
    ].join("\n");
    const event =
      (await openAIJson<EventPayload>(system, {
        request: prompt || "현대 한국 배경의 심심풀이 TRPG 이벤트",
        variety_seed: `${new Date().toISOString()}-${crypto.randomUUID()}`,
        required_quality: [
          "title은 18자 이하로 강렬하게",
          "scene은 3~5문장. 장소, 위협, 이상 현상, 첫 단서를 포함",
          "stakes는 1~2문장. 실패 결과, 당장 목표, 숨은 규칙의 힌트를 포함",
          "tone은 장르 2개 이상을 섞어 짧게",
          "플레이어를 강제로 죽이지 말고, 행동으로 상황이 바뀌게 만들 것",
        ],
        avoid: [
          "이전과 같은 펜션 좀비",
          "정전된 지하상가",
          "가면 행렬",
          "너무 추상적인 공포",
          "선택지가 없는 장면",
        ],
        schema: {
          title: "짧은 제목",
          scene: "첫 장면 묘사. 플레이어가 바로 행동할 수 있어야 함",
          stakes: "위험, 목표, 숨은 규칙의 힌트",
          tone: "분위기",
        },
      })) || fallbackEvent(prompt || "");

    const supabase = adminClient;
    await supabase.from("events").update({ active: false }).eq("room_id", room_id).eq("active", true);

    const { data: inserted, error: eventError } = await supabase
      .from("events")
      .insert({ room_id, ...event, active: true })
      .select()
      .single();
    if (eventError) throw eventError;

    const text = `[${event.title}]\n${event.scene}\n\n목표/위험: ${event.stakes}`;
    const { error: messageError } = await supabase.from("messages").insert({
      room_id,
      nickname: "GM",
      kind: "event",
      text,
      meta: event,
    });
    if (messageError) throw messageError;

    return Response.json({ ok: true, event: inserted }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ ok: false, error: String(error.message || error) }, { status: 400, headers: corsHeaders });
  }
});
