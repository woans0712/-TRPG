import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { handleCommand } from "./commands.ts";

type EventType = "join" | "leave" | "rename" | "message";
type Action = "ingest" | "lookup" | "note" | "merge" | "command";
type SupabaseClient = ReturnType<typeof createClient>;

type Person = {
  id: string;
  first_nickname: string;
  current_nickname: string;
  join_count: number;
  leave_count: number;
  last_seen_at: string | null;
};

const maxLookupRows = 80;

function normalizeNickname(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function nowIso() {
  return new Date().toISOString();
}

function eventTime(value: unknown) {
  const parsed = value ? new Date(String(value)) : new Date();
  return Number.isNaN(parsed.getTime()) ? nowIso() : parsed.toISOString();
}

function requireBotToken(req: Request) {
  const expected = Deno.env.get("KAKAO_BOT_INGEST_TOKEN");
  if (!expected) throw new Error("KAKAO_BOT_INGEST_TOKEN is not configured.");
  const provided = req.headers.get("x-bot-token") || "";
  if (provided !== expected) throw new Error("Invalid bot token.");
}

function bigrams(value: string) {
  const compact = value.toLowerCase().replace(/\s+/g, "");
  if (compact.length <= 1) return new Set([compact]);
  const grams = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1) {
    grams.add(compact.slice(index, index + 2));
  }
  return grams;
}

function similarity(left: string, right: string) {
  const leftGrams = bigrams(left);
  const rightGrams = bigrams(right);
  const union = new Set([...leftGrams, ...rightGrams]);
  if (union.size === 0) return 0;
  let overlap = 0;
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) overlap += 1;
  }
  return overlap / union.size;
}

async function ensureRoom(supabase: SupabaseClient, roomKey: string, title?: string) {
  const { data: existing, error: fetchError } = await supabase
    .from("kakao_rooms")
    .select("id,room_key,title")
    .eq("room_key", roomKey)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (existing) {
    if (title && title !== existing.title) {
      const { data: updated, error: updateError } = await supabase
        .from("kakao_rooms")
        .update({ title })
        .eq("id", existing.id)
        .select("id,room_key,title")
        .single();
      if (updateError) throw updateError;
      return updated;
    }
    return existing;
  }

  const { data: room, error } = await supabase
    .from("kakao_rooms")
    .insert({ room_key: roomKey, title: title || null })
    .select("id,room_key,title")
    .single();
  if (error) throw error;
  return room;
}

async function findPersonByNickname(supabase: SupabaseClient, roomId: string, nickname: string) {
  const { data: alias, error } = await supabase
    .from("kakao_aliases")
    .select("person_id")
    .eq("room_id", roomId)
    .eq("nickname", nickname)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!alias?.person_id) return null;

  const { data: person, error: personError } = await supabase
    .from("kakao_people")
    .select("id,first_nickname,current_nickname,join_count,leave_count,last_seen_at")
    .eq("id", alias.person_id)
    .single();
  if (personError) throw personError;
  return person as Person;
}

async function createPerson(supabase: SupabaseClient, roomId: string, nickname: string, at: string) {
  const { data: person, error } = await supabase
    .from("kakao_people")
    .insert({
      room_id: roomId,
      first_nickname: nickname,
      current_nickname: nickname,
      last_seen_at: at,
    })
    .select("id,first_nickname,current_nickname,join_count,leave_count,last_seen_at")
    .single();
  if (error) throw error;
  await upsertAlias(supabase, roomId, person.id, nickname, at);
  return person as Person;
}

async function upsertAlias(
  supabase: SupabaseClient,
  roomId: string,
  personId: string,
  nickname: string,
  at: string,
) {
  const { data: existing, error: fetchError } = await supabase
    .from("kakao_aliases")
    .select("id,first_seen_at")
    .eq("room_id", roomId)
    .eq("person_id", personId)
    .eq("nickname", nickname)
    .maybeSingle();
  if (fetchError) throw fetchError;

  if (existing) {
    const { error } = await supabase
      .from("kakao_aliases")
      .update({ last_seen_at: at })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("kakao_aliases")
    .insert({ room_id: roomId, person_id: personId, nickname, first_seen_at: at, last_seen_at: at });
  if (error) throw error;
}

async function updatePersonSeen(
  supabase: SupabaseClient,
  roomId: string,
  person: Person,
  nickname: string,
  at: string,
  eventType: EventType,
) {
  const patch: Record<string, unknown> = {
    current_nickname: nickname,
    last_seen_at: at,
  };
  if (eventType === "join") patch.join_count = person.join_count + 1;
  if (eventType === "leave") patch.leave_count = person.leave_count + 1;

  const { data, error } = await supabase
    .from("kakao_people")
    .update(patch)
    .eq("id", person.id)
    .select("id,first_nickname,current_nickname,join_count,leave_count,last_seen_at")
    .single();
  if (error) throw error;
  await upsertAlias(supabase, roomId, person.id, nickname, at);
  return data as Person;
}

async function suspicionCandidates(supabase: SupabaseClient, roomId: string, nickname: string, at: string) {
  const since = new Date(new Date(at).getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data: leaves, error } = await supabase
    .from("kakao_events")
    .select("person_id,nickname,occurred_at")
    .eq("room_id", roomId)
    .eq("event_type", "leave")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(30);
  if (error) throw error;

  return (leaves || [])
    .map((leave) => ({
      person_id: leave.person_id,
      nickname: leave.nickname,
      left_at: leave.occurred_at,
      score: Number(similarity(nickname, leave.nickname || "").toFixed(2)),
    }))
    .filter((candidate) => candidate.person_id && candidate.score >= 0.35)
    .slice(0, 5);
}

async function ingest(supabase: SupabaseClient, body: Record<string, unknown>) {
  const roomKey = normalizeNickname(body.room_key || "main");
  const room = await ensureRoom(supabase, roomKey, normalizeNickname(body.room_title));
  const eventType = String(body.event_type || "") as EventType;
  if (!["join", "leave", "rename", "message"].includes(eventType)) throw new Error("Unsupported event_type.");

  const at = eventTime(body.occurred_at);
  const nickname = normalizeNickname(body.nickname);
  const oldNickname = normalizeNickname(body.old_nickname);
  const newNickname = normalizeNickname(body.new_nickname);
  const effectiveNickname = eventType === "rename" ? newNickname : nickname;
  if (!effectiveNickname && eventType !== "rename") throw new Error("nickname is required.");
  if (eventType === "rename" && (!oldNickname || !newNickname)) {
    throw new Error("old_nickname and new_nickname are required for rename events.");
  }

  let person = eventType === "rename"
    ? await findPersonByNickname(supabase, room.id, oldNickname)
    : await findPersonByNickname(supabase, room.id, effectiveNickname);
  if (!person) person = await createPerson(supabase, room.id, eventType === "rename" ? oldNickname : effectiveNickname, at);

  await upsertAlias(supabase, room.id, person.id, eventType === "rename" ? oldNickname : effectiveNickname, at);
  if (eventType === "rename") await upsertAlias(supabase, room.id, person.id, newNickname, at);

  const updated = await updatePersonSeen(supabase, room.id, person, effectiveNickname || oldNickname, at, eventType);
  const candidates = eventType === "join" ? await suspicionCandidates(supabase, room.id, effectiveNickname, at) : [];

  const { data: event, error } = await supabase
    .from("kakao_events")
    .insert({
      room_id: room.id,
      person_id: updated.id,
      event_type: eventType,
      nickname: effectiveNickname || oldNickname || null,
      old_nickname: oldNickname || null,
      new_nickname: newNickname || null,
      message_text: body.message_text ? String(body.message_text).slice(0, 2000) : null,
      suspicion_candidates: candidates,
      source: normalizeNickname(body.source || "notification"),
      occurred_at: at,
    })
    .select("id")
    .single();
  if (error) throw error;

  return { event_id: event.id, person: updated, suspicion_candidates: candidates };
}

async function lookup(supabase: SupabaseClient, body: Record<string, unknown>) {
  const roomKey = normalizeNickname(body.room_key || "main");
  const nickname = normalizeNickname(body.nickname);
  if (!nickname) throw new Error("nickname is required.");

  const room = await ensureRoom(supabase, roomKey);
  const { data: aliases, error: aliasError } = await supabase
    .from("kakao_aliases")
    .select("person_id,nickname,first_seen_at,last_seen_at")
    .eq("room_id", room.id)
    .ilike("nickname", `%${nickname}%`)
    .order("last_seen_at", { ascending: false })
    .limit(20);
  if (aliasError) throw aliasError;

  const personIds = [...new Set((aliases || []).map((alias) => alias.person_id))];
  if (personIds.length === 0) return { people: [] };

  const { data: people, error: peopleError } = await supabase
    .from("kakao_people")
    .select("id,first_nickname,current_nickname,join_count,leave_count,last_seen_at,created_at")
    .in("id", personIds);
  if (peopleError) throw peopleError;

  const { data: events, error: eventsError } = await supabase
    .from("kakao_events")
    .select("person_id,event_type,nickname,old_nickname,new_nickname,message_text,occurred_at,suspicion_candidates")
    .in("person_id", personIds)
    .order("occurred_at", { ascending: false })
    .limit(maxLookupRows);
  if (eventsError) throw eventsError;

  const { data: notes, error: notesError } = await supabase
    .from("kakao_notes")
    .select("person_id,note,severity,created_by,created_at")
    .in("person_id", personIds)
    .order("created_at", { ascending: false });
  if (notesError) throw notesError;

  return {
    people: (people || []).map((person) => ({
      ...person,
      aliases: (aliases || []).filter((alias) => alias.person_id === person.id),
      events: (events || []).filter((event) => event.person_id === person.id),
      notes: (notes || []).filter((note) => note.person_id === person.id),
    })),
  };
}

async function note(supabase: SupabaseClient, body: Record<string, unknown>) {
  const room = await ensureRoom(supabase, normalizeNickname(body.room_key || "main"));
  const nickname = normalizeNickname(body.nickname);
  const text = String(body.note || "").trim();
  const severity = ["info", "watch", "block"].includes(String(body.severity)) ? String(body.severity) : "info";
  if (!nickname || !text) throw new Error("nickname and note are required.");

  const person = await findPersonByNickname(supabase, room.id, nickname)
    || await createPerson(supabase, room.id, nickname, nowIso());
  const { data, error } = await supabase
    .from("kakao_notes")
    .insert({
      room_id: room.id,
      person_id: person.id,
      note: text,
      severity,
      created_by: normalizeNickname(body.created_by || "bot"),
    })
    .select("id")
    .single();
  if (error) throw error;
  return { note_id: data.id, person };
}

async function mergePeople(supabase: SupabaseClient, body: Record<string, unknown>) {
  const sourceId = String(body.source_person_id || "");
  const targetId = String(body.target_person_id || "");
  if (!sourceId || !targetId || sourceId === targetId) throw new Error("source_person_id and target_person_id are required.");

  const { data: source, error: sourceError } = await supabase
    .from("kakao_people")
    .select("id,room_id,join_count,leave_count")
    .eq("id", sourceId)
    .single();
  if (sourceError) throw sourceError;

  const { data: target, error: targetError } = await supabase
    .from("kakao_people")
    .select("id,room_id,join_count,leave_count")
    .eq("id", targetId)
    .single();
  if (targetError) throw targetError;
  if (source.room_id !== target.room_id) throw new Error("People must belong to the same room.");

  const { data: sourceAliases, error: sourceAliasError } = await supabase
    .from("kakao_aliases")
    .select("id,nickname,last_seen_at")
    .eq("person_id", sourceId);
  if (sourceAliasError) throw sourceAliasError;

  for (const alias of sourceAliases || []) {
    await upsertAlias(supabase, source.room_id, targetId, alias.nickname, alias.last_seen_at);
  }

  const { error: aliasError } = await supabase.from("kakao_aliases").delete().eq("person_id", sourceId);
  if (aliasError) throw aliasError;
  const { error: eventError } = await supabase.from("kakao_events").update({ person_id: targetId }).eq("person_id", sourceId);
  if (eventError) throw eventError;
  const { error: noteError } = await supabase.from("kakao_notes").update({ person_id: targetId }).eq("person_id", sourceId);
  if (noteError) throw noteError;

  const { error: updateError } = await supabase
    .from("kakao_people")
    .update({
      join_count: Number(target.join_count || 0) + Number(source.join_count || 0),
      leave_count: Number(target.leave_count || 0) + Number(source.leave_count || 0),
    })
    .eq("id", targetId);
  if (updateError) throw updateError;

  const { error: deleteError } = await supabase.from("kakao_people").delete().eq("id", sourceId);
  if (deleteError) throw deleteError;
  return { merged: true, source_person_id: sourceId, target_person_id: targetId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    requireBotToken(req);
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(url, serviceKey);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "lookup") as Action;

    if (!["ingest", "lookup", "note", "merge", "command"].includes(action)) throw new Error("Unsupported action.");

    const data =
      action === "ingest" ? await ingest(supabase, body)
        : action === "lookup" ? await lookup(supabase, body)
          : action === "note" ? await note(supabase, body)
            : action === "command" ? await handleCommand(body, {
              lookup: (payload) => lookup(supabase, payload),
              note: (payload) => note(supabase, payload),
            })
              : await mergePeople(supabase, body);

    return Response.json({ ok: true, data }, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { ok: false, error: String(error.message || error) },
      { status: 400, headers: corsHeaders },
    );
  }
});
