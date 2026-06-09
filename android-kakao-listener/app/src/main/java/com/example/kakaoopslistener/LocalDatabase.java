package com.example.kakaoopslistener;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

final class LocalDatabase extends SQLiteOpenHelper {
    private static final String NAME = "kakao_ops_local.db";
    private static final int VERSION = 1;

    LocalDatabase(Context context) {
        super(context, NAME, null, VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL(
            "CREATE TABLE rooms ("
                + "id INTEGER PRIMARY KEY AUTOINCREMENT,"
                + "room_key TEXT NOT NULL UNIQUE,"
                + "title TEXT,"
                + "created_at INTEGER NOT NULL,"
                + "updated_at INTEGER NOT NULL"
                + ")"
        );
        db.execSQL(
            "CREATE TABLE local_events ("
                + "id INTEGER PRIMARY KEY AUTOINCREMENT,"
                + "dedupe_key TEXT NOT NULL UNIQUE,"
                + "room_key TEXT NOT NULL,"
                + "event_type TEXT NOT NULL,"
                + "nickname TEXT,"
                + "old_nickname TEXT,"
                + "new_nickname TEXT,"
                + "message_text TEXT,"
                + "source TEXT NOT NULL,"
                + "sent INTEGER NOT NULL DEFAULT 0,"
                + "created_at INTEGER NOT NULL,"
                + "sent_at INTEGER"
                + ")"
        );
        db.execSQL("CREATE INDEX local_events_room_created_idx ON local_events(room_key, created_at DESC)");
        db.execSQL("CREATE INDEX local_events_nickname_idx ON local_events(nickname)");
        db.execSQL(
            "CREATE TABLE local_aliases ("
                + "id INTEGER PRIMARY KEY AUTOINCREMENT,"
                + "room_key TEXT NOT NULL,"
                + "nickname TEXT NOT NULL,"
                + "first_seen_at INTEGER NOT NULL,"
                + "last_seen_at INTEGER NOT NULL,"
                + "UNIQUE(room_key, nickname)"
                + ")"
        );
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        throw new IllegalStateException("Unsupported database upgrade " + oldVersion + " -> " + newVersion);
    }
}
