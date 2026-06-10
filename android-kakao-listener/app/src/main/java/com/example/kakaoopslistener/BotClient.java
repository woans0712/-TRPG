package com.example.kakaoopslistener;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class BotClient {
    private BotClient() {}

    static String send(Context context, String roomKey, BotEvent event) throws Exception {
        return send(context, roomKey, event, "android_notification", "");
    }

    static String send(Context context, String roomKey, BotEvent event, String source, String dedupeKey) throws Exception {
        JSONObject json = basePayload(roomKey, "ingest");
        json.put("event_type", event.eventType);
        json.put("source", source);

        if (!event.nickname.isEmpty()) json.put("nickname", event.nickname);
        if (!event.oldNickname.isEmpty()) json.put("old_nickname", event.oldNickname);
        if (!event.newNickname.isEmpty()) json.put("new_nickname", event.newNickname);
        if (!event.messageText.isEmpty()) json.put("message_text", event.messageText);
        if (!event.occurredAt.isEmpty()) json.put("occurred_at", event.occurredAt);
        if (!dedupeKey.isEmpty()) json.put("dedupe_key", dedupeKey);

        return post(context, json);
    }

    static String send(Context context, BotEvent event) throws Exception {
        return send(context, SettingsStore.roomKey(context), event);
    }

    static String sendBatch(Context context, String roomKey, java.util.List<BatchEvent> events) throws Exception {
        JSONObject json = basePayload(roomKey, "ingest_many");
        JSONArray array = new JSONArray();
        for (BatchEvent item : events) {
            JSONObject eventJson = new JSONObject();
            eventJson.put("event_type", item.event.eventType);
            eventJson.put("source", item.source);
            eventJson.put("dedupe_key", item.dedupeKey);
            if (!item.event.nickname.isEmpty()) eventJson.put("nickname", item.event.nickname);
            if (!item.event.oldNickname.isEmpty()) eventJson.put("old_nickname", item.event.oldNickname);
            if (!item.event.newNickname.isEmpty()) eventJson.put("new_nickname", item.event.newNickname);
            if (!item.event.messageText.isEmpty()) eventJson.put("message_text", item.event.messageText);
            if (!item.event.occurredAt.isEmpty()) eventJson.put("occurred_at", item.event.occurredAt);
            array.put(eventJson);
        }
        json.put("events", array);
        return post(context, json);
    }

    static JSONObject lookup(Context context, String roomKey, String nickname) throws Exception {
        JSONObject json = basePayload(roomKey, "lookup");
        json.put("nickname", nickname);
        return new JSONObject(post(context, json));
    }

    static JSONObject note(Context context, String roomKey, String nickname, String severity, String note) throws Exception {
        JSONObject json = basePayload(roomKey, "note");
        json.put("nickname", nickname);
        json.put("severity", severity);
        json.put("note", note);
        json.put("created_by", "android-bot");
        return new JSONObject(post(context, json));
    }

    static JSONObject command(Context context, String roomKey, String nickname, String commandText) throws Exception {
        JSONObject json = basePayload(roomKey, "command");
        json.put("nickname", nickname);
        json.put("message_text", commandText);
        return new JSONObject(post(context, json));
    }

    private static JSONObject basePayload(String roomKey, String action) throws Exception {
        JSONObject json = new JSONObject();
        json.put("action", action);
        json.put("room_key", roomKey);
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
        connection.setConnectTimeout(4000);
        connection.setReadTimeout(6000);
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

    static final class BatchEvent {
        final BotEvent event;
        final String dedupeKey;
        final String source;

        BatchEvent(BotEvent event, String dedupeKey, String source) {
            this.event = event;
            this.dedupeKey = dedupeKey;
            this.source = source;
        }
    }
}
