package com.example.kakaoopslistener;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class KakaoNotificationListener extends NotificationListenerService {
    private static final String TAG = "KakaoOpsListener";
    private static final String KAKAO_PACKAGE = "com.kakao.talk";
    private static final int MAX_DEDUPE = 80;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Set<String> recentKeys = new HashSet<>();

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (!KAKAO_PACKAGE.equals(sbn.getPackageName())) return;
        Notification notification = sbn.getNotification();
        if (notification == null || notification.extras == null) return;

        Bundle extras = notification.extras;
        String title = asString(extras.getCharSequence(Notification.EXTRA_TITLE));
        String text = asString(extras.getCharSequence(Notification.EXTRA_TEXT));
        String bigText = asString(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));

        BotEvent event = EventParser.parse(title, text, bigText);
        if (event == null) return;

        String dedupeKey = sbn.getPostTime() + "|" + event.eventType + "|" + event.nickname + "|"
            + event.oldNickname + "|" + event.newNickname + "|" + event.messageText;
        synchronized (recentKeys) {
            if (recentKeys.contains(dedupeKey)) return;
            if (recentKeys.size() > MAX_DEDUPE) recentKeys.clear();
            recentKeys.add(dedupeKey);
        }

        executor.execute(() -> {
            try {
                String response = BotClient.send(getApplicationContext(), event);
                Log.i(TAG, "Sent " + event.eventType + ": " + response);
                if (CommandHandler.isCommand(event)) {
                    String reply = CommandHandler.handle(getApplicationContext(), event);
                    if (reply != null && !reply.trim().isEmpty()) {
                        boolean replied = NotificationReply.send(getApplicationContext(), notification, reply);
                        Log.i(TAG, "Command reply " + (replied ? "sent" : "unavailable"));
                    }
                }
            } catch (Exception error) {
                Log.e(TAG, "Failed to send event", error);
            }
        });
    }

    private static String asString(CharSequence value) {
        return value == null ? "" : value.toString();
    }
}
