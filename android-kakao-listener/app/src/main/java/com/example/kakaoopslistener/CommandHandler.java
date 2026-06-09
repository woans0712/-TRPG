package com.example.kakaoopslistener;

import android.content.Context;

import org.json.JSONObject;

final class CommandHandler {
    private CommandHandler() {}

    static boolean isCommand(BotEvent event) {
        if (!"message".equals(event.eventType)) return false;
        String text = event.messageText == null ? "" : event.messageText.trim();
        return text.startsWith("/") || text.startsWith("!");
    }

    static String handle(Context context, BotEvent event) throws Exception {
        JSONObject response = BotClient.command(context, event.nickname, event.messageText);
        if (!response.optBoolean("ok")) return "명령 처리 실패: " + response.optString("error");

        JSONObject data = response.optJSONObject("data");
        if (data == null) return null;
        String reply = data.optString("reply", "");
        return reply.trim().isEmpty() ? null : reply;
    }
}
