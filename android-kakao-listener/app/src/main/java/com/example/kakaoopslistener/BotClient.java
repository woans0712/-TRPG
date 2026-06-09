package com.example.kakaoopslistener;

import android.content.Context;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.OutputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class BotClient {
    private BotClient() {}

    static String send(Context context, BotEvent event) throws Exception {
        String endpoint = SettingsStore.endpoint(context);
        String token = SettingsStore.token(context);
        String roomKey = SettingsStore.roomKey(context);
        if (endpoint.isEmpty()) throw new IllegalStateException("Endpoint is empty.");
        if (token.isEmpty()) throw new IllegalStateException("Bot token is empty.");

        JSONObject json = new JSONObject();
        json.put("action", "ingest");
        json.put("room_key", roomKey);
        json.put("event_type", event.eventType);
        json.put("source", "android_notification");

        if (!event.nickname.isEmpty()) json.put("nickname", event.nickname);
        if (!event.oldNickname.isEmpty()) json.put("old_nickname", event.oldNickname);
        if (!event.newNickname.isEmpty()) json.put("new_nickname", event.newNickname);
        if (!event.messageText.isEmpty()) json.put("message_text", event.messageText);

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
