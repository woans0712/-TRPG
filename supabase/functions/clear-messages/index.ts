import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

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

    const { room_id } = await req.json();
    if (!room_id) throw new Error("room_id가 필요합니다.");

    const supabase = createClient(url, serviceKey);
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id,nickname,is_admin")
      .eq("id", userData.user.id)
      .single();
    if (profileError || !profile) throw new Error("프로필을 찾을 수 없습니다.");
    if (!profile.is_admin) throw new Error("관리자만 채팅 기록을 삭제할 수 있습니다.");

    const { error: deleteError } = await supabase.from("messages").delete().eq("room_id", room_id);
    if (deleteError) throw deleteError;

    const { error: insertError } = await supabase.from("messages").insert({
      room_id,
      user_id: profile.id,
      nickname: "GM",
      kind: "system",
      text: `${profile.nickname} 관리자가 채팅 기록을 삭제했습니다.`,
      meta: { admin_id: profile.id },
    });
    if (insertError) throw insertError;

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ ok: false, error: String(error.message || error) }, { status: 400, headers: corsHeaders });
  }
});
