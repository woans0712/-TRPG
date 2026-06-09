package com.example.kakaoopslistener;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.LinkedHashSet;
import java.util.Set;

final class CommandHandler {
    private CommandHandler() {}

    static boolean isCommand(BotEvent event) {
        if (!"message".equals(event.eventType)) return false;
        String text = event.messageText == null ? "" : event.messageText.trim();
        return text.startsWith("/") || text.startsWith("!");
    }

    static String handle(Context context, BotEvent event) throws Exception {
        String text = event.messageText.trim();
        String[] parts = text.split("\\s+", 3);
        String command = parts[0];

        if ("/help".equalsIgnoreCase(command) || "/도움".equals(command) || "!도움".equals(command)) {
            return help();
        }

        if ("/조회".equals(command) || "/기록".equals(command) || "/닉변".equals(command) || "!조회".equals(command)) {
            if (parts.length < 2) return "사용법: /조회 닉네임";
            JSONObject response = BotClient.lookup(context, parts[1]);
            return formatLookup(parts[1], response);
        }

        if ("/주의".equals(command) || "/메모".equals(command) || "/차단".equals(command)) {
            if (parts.length < 3) return "사용법: " + command + " 닉네임 내용";
            String severity = "/차단".equals(command) ? "block" : "/주의".equals(command) ? "watch" : "info";
            JSONObject response = BotClient.note(context, parts[1], severity, parts[2]);
            if (!response.optBoolean("ok")) return "저장 실패: " + response.optString("error");
            return "메모 저장 완료: " + parts[1];
        }

        return null;
    }

    private static String help() {
        return "명령어\n"
            + "/조회 닉네임 - 기록 조회\n"
            + "/닉변 닉네임 - 닉네임 기록 조회\n"
            + "/주의 닉네임 내용 - 주의 메모\n"
            + "/메모 닉네임 내용 - 일반 메모\n"
            + "/차단 닉네임 내용 - 차단 메모";
    }

    private static String formatLookup(String query, JSONObject response) {
        if (!response.optBoolean("ok")) return "조회 실패: " + response.optString("error");
        JSONObject data = response.optJSONObject("data");
        JSONArray people = data == null ? null : data.optJSONArray("people");
        if (people == null || people.length() == 0) return "조회 결과 없음: " + query;

        JSONObject person = people.optJSONObject(0);
        if (person == null) return "조회 결과 없음: " + query;

        StringBuilder out = new StringBuilder();
        out.append("조회: ").append(person.optString("current_nickname")).append('\n');
        out.append("최초닉: ").append(person.optString("first_nickname")).append('\n');
        out.append("입장 ").append(person.optInt("join_count"))
            .append(" / 퇴장 ").append(person.optInt("leave_count")).append('\n');

        JSONArray aliases = person.optJSONArray("aliases");
        Set<String> names = new LinkedHashSet<>();
        if (aliases != null) {
            for (int index = 0; index < aliases.length(); index += 1) {
                JSONObject alias = aliases.optJSONObject(index);
                if (alias != null) names.add(alias.optString("nickname"));
            }
        }
        if (!names.isEmpty()) {
            out.append("닉네임: ");
            int count = 0;
            for (String name : names) {
                if (count > 0) out.append(", ");
                out.append(name);
                count += 1;
                if (count >= 6) break;
            }
            out.append('\n');
        }

        JSONArray events = person.optJSONArray("events");
        int renameCount = 0;
        if (events != null) {
            for (int index = 0; index < events.length() && renameCount < 3; index += 1) {
                JSONObject item = events.optJSONObject(index);
                if (item == null || !"rename".equals(item.optString("event_type"))) continue;
                if (renameCount == 0) out.append("닉변:\n");
                out.append("- ").append(item.optString("old_nickname"))
                    .append(" -> ").append(item.optString("new_nickname")).append('\n');
                renameCount += 1;
            }
        }

        JSONArray notes = person.optJSONArray("notes");
        if (notes != null && notes.length() > 0) {
            JSONObject note = notes.optJSONObject(0);
            if (note != null) {
                out.append("최근메모[").append(note.optString("severity")).append("]: ")
                    .append(note.optString("note")).append('\n');
            }
        }

        String result = out.toString().trim();
        return result.length() > 900 ? result.substring(0, 900) : result;
    }
}
