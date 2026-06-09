package com.example.kakaoopslistener;

import android.content.Context;
import android.content.SharedPreferences;

final class SettingsStore {
    static final String DEFAULT_ENDPOINT = "https://tdbssdethpdpxdhhgjtq.supabase.co/functions/v1/kakao-ops";
    private static final String PREFS = "kakao_ops_listener";

    private SettingsStore() {}

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String endpoint(Context context) {
        return prefs(context).getString("endpoint", DEFAULT_ENDPOINT);
    }

    static String token(Context context) {
        return prefs(context).getString("token", "");
    }

    static String roomKey(Context context) {
        return prefs(context).getString("room_key", "main-openchat");
    }

    static void save(Context context, String endpoint, String token, String roomKey) {
        prefs(context).edit()
            .putString("endpoint", endpoint.trim())
            .putString("token", token.trim())
            .putString("room_key", roomKey.trim())
            .apply();
    }
}
