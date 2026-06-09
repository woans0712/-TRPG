package com.example.kakaoopslistener;

import android.app.Notification;
import android.content.Context;
import android.os.Bundle;

final class NotificationMetadata {
    private NotificationMetadata() {}

    static String roomKey(Context context, Bundle extras) {
        String[] candidates = new String[] {
            asString(extras.getCharSequence(Notification.EXTRA_SUB_TEXT)),
            asString(extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT)),
            asString(extras.getCharSequence("android.conversationTitle")),
            asString(extras.getCharSequence(Notification.EXTRA_TITLE_BIG)),
        };

        for (String candidate : candidates) {
            String cleaned = clean(candidate);
            if (!cleaned.isEmpty() && cleaned.length() <= 80) return cleaned;
        }
        return SettingsStore.roomKey(context);
    }

    private static String asString(CharSequence value) {
        return value == null ? "" : value.toString();
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim().replaceAll("\\s+", " ");
    }
}
