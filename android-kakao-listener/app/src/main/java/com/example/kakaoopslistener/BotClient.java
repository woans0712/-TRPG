package com.example.kakaoopslistener;

import android.content.Context;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class BotClient {
    private BotClient() {}

    static String send(Context context, BotEvent event) throws Exception {
        JSONObject json = basePayload(context, "ingest");
        json.put("event_type", event.eventType);
        json.put("source", "android_notification");

        if (!event.nickname.isEmpty()) json.put("nickname", event.nickname);
        if (!event.oldNickname.isEmpty()) json.put("old_nickname", event.oldNickname);
        if (!event.newNickname.isEmpty()) json.put("new_nickname", event.newNickname);
        if (!event.messageText.isEmpty()) json.put("message_text", event.messageText);

        return post(context, json);
    }

    static JSONObject lookup(Context context, String nickname) throws Exception {
        JSONObject json = basePayload(context, "lookup");
        json.put("nickname", nickname);
        return new JSONObject(post(context, json));
    }

    static JSONObject note(Context context, String nickname, String severity, String note) throws Exception {
        JSONObject json = basePayload(context, "note");
        json.put("nickname", nickname);
        json.put("severity", severity);
        json.put("note", note);
        json.put("created_by", "android-bot");
        return new JSONObject(post(context, json));
    }

    static JSONObject command(Context context, String nickname, String commandText) throws Exception {
        JSONObject json = basePayload(context, "command");
        json.put("nickname", nickname);
        json.put("message_text", commandText);
        return new JSONObject(post(context, json));
    }

    private static JSONObject basePayload(Context context, String action) throws Exception {
        JSONObject json = new JSONObject();
        json.put("action", action);
        json.put("room_key", SettingsStore.roomKey(context));
        return json;
    }

    private static String post(Context context, JSONObject json) throws Exception {
        String endpoint = SettingsStore.endpoint(context);
        String token = SettingsStore.token(context);
        if (endpoint.isEmpty()) throw new IllegalStateException("Endpoint is empty.");
        if (token.isEmpty()) throw new IllegalStateException("Bot token is empty.");

        byte[] body = json.toString().getBytes(StandardCharsets.UTF_8);
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(15000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        connection.setRequestProperty("x-bot-token", token);
        connection.setFixedLengthStreamingMode(body.length);

        try (OutputStream output = connection.getOutputStream()) {
            output.write(body);
        }

        int status = connection.getResponseCode();
        BufferedReader reader = new BufferedReader(new InputStreamReader(
            status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream(),
            StandardCharsets.UTF_8
        ));
        StringBuilder response = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) response.append(line);
        if (status < 200 || status >= 300) {
            throw new IllegalStateException("HTTP " + status + ": " + response);
        }
        return response.toString();
    }
}
