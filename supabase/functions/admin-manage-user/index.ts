import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type ManageAction = "reset" | "delete";

const saveKey = "enhanceWorkshop";

function defaultGame() {
  return {
    level: 0,
    attempts: 10,
    bestLevel: 0,
    destroyed: false,
    history: [],
    nextAttemptAt: null,
    version: 1,
  };
}

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

    const { action, target_user_id } = await req.json();
    if (!["reset", "delete"].includes(action)) throw new Error("지원하지 않는 관리자 작업입니다.");
    if (!target_user_id) throw new Error("target_user_id가 필요합니다.");

    const supabase = createClient(url, serviceKey);
    const { data: adminProfile, error: adminError } = await supabase
      .from("profiles")
      .select("id,nickname,is_admin")
      .eq("id", userData.user.id)
      .single();
    if (adminError || !adminProfile?.is_admin) throw new Error("관리자만 사용할 수 있습니다.");

    if (target_user_id === adminProfile.id && action === "delete") {
      throw new Error("현재 로그인한 관리자 계정은 삭제할 수 없습니다.");
    }

    const { data: targetProfile, error: targetError } = await supabase
      .from("profiles")
      .select("id,nickname,inventory")
      .eq("id", target_user_id)
      .single();
    if (targetError || !targetProfile) throw new Error("대상 유저를 찾을 수 없습니다.");

    if ((action as ManageAction) === "reset") {
      const inventory =
        targetProfile.inventory && !Array.isArray(targetProfile.inventory) ? targetProfile.inventory : {};
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          inventory: {
            ...inventory,
            [saveKey]: defaultGame(),
          },
        })
        .eq("id", target_user_id);
      if (updateError) throw updateError;

      return Response.json({ ok: true, action, nickname: targetProfile.nickname }, { headers: corsHeaders });
    }

    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(target_user_id);
    if (deleteUserError) throw deleteUserError;

    const { error: deleteProfileError } = await supabase.from("profiles").delete().eq("id", target_user_id);
    if (deleteProfileError) throw deleteProfileError;

    return Response.json({ ok: true, action, nickname: targetProfile.nickname }, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { ok: false, error: String(error.message || error) },
      { status: 400, headers: corsHeaders },
    );
  }
});
