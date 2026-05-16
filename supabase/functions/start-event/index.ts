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

    const system =
      "너는 한국어 TRPG 게임마스터다. 개연성, 긴장감, 플레이어 선택의 여지를 중시한다. 반드시 JSON만 반환한다.";
    const event =
      (await openAIJson<EventPayload>(system, {
        request: prompt || "현대 한국 배경의 심심풀이 생존 TRPG 이벤트",
        schema: {
          title: "짧은 제목",
          scene: "첫 장면 묘사",
          stakes: "위험과 목표",
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
