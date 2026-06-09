package com.example.kakaoopslistener;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

final class LocalEventStore {
    private LocalEventStore() {}

    static long save(Context context, String roomKey, BotEvent event, String dedupeKey, String source) {
        long now = eventTimeMillis(event);
        LocalDatabase helper = new LocalDatabase(context);
        SQLiteDatabase db = helper.getWritableDatabase();
        db.beginTransaction();
        try {
            upsertRoom(db, roomKey, now);
            long id = insertEvent(db, roomKey, event, dedupeKey, source, now);
            upsertAlias(db, roomKey, event.displayName(), now);
            if ("rename".equals(event.eventType)) {
                upsertAlias(db, roomKey, event.oldNickname, now);
                upsertAlias(db, roomKey, event.newNickname, now);
            }
            db.setTransactionSuccessful();
            return id;
        } finally {
            db.endTransaction();
            db.close();
        }
    }

    static void markSent(Context context, String dedupeKey) {
        ContentValues values = new ContentValues();
        values.put("sent", 1);
        values.put("sent_at", System.currentTimeMillis());
        LocalDatabase helper = new LocalDatabase(context);
        SQLiteDatabase db = helper.getWritableDatabase();
        try {
            db.update("local_events", values, "dedupe_key = ?", new String[] { dedupeKey });
        } finally {
            db.close();
        }
    }

    static String summary(Context context) {
        LocalDatabase helper = new LocalDatabase(context);
        SQLiteDatabase db = helper.getReadableDatabase();
        try {
            long rooms = count(db, "rooms");
            long events = count(db, "local_events");
            long unsent = count(db, "local_events", "sent = 0");
            return "Local DB rooms=" + rooms + ", events=" + events + ", unsent=" + unsent;
        } finally {
            db.close();
        }
    }

    private static void upsertRoom(SQLiteDatabase db, String roomKey, long now) {
        ContentValues values = new ContentValues();
        values.put("room_key", roomKey);
        values.put("title", roomKey);
        values.put("created_at", now);
        values.put("updated_at", now);
        long id = db.insertWithOnConflict("rooms", null, values, SQLiteDatabase.CONFLICT_IGNORE);
        if (id == -1) {
            ContentValues update = new ContentValues();
            update.put("updated_at", now);
            db.update("rooms", update, "room_key = ?", new String[] { roomKey });
        }
    }

    private static long insertEvent(SQLiteDatabase db, String roomKey, BotEvent event, String dedupeKey, String source, long now) {
        ContentValues values = new ContentValues();
        values.put("dedupe_key", dedupeKey);
        values.put("room_key", roomKey);
        values.put("event_type", event.eventType);
        values.put("nickname", event.nickname);
        values.put("old_nickname", event.oldNickname);
        values.put("new_nickname", event.newNickname);
        values.put("message_text", event.messageText);
        values.put("source", source);
        values.put("created_at", now);
        return db.insertWithOnConflict("local_events", null, values, SQLiteDatabase.CONFLICT_IGNORE);
    }

    private static void upsertAlias(SQLiteDatabase db, String roomKey, String nickname, long now) {
        if (nickname == null || nickname.trim().isEmpty()) return;
        String clean = nickname.trim();
        ContentValues values = new ContentValues();
        values.put("room_key", roomKey);
        values.put("nickname", clean);
        values.put("first_seen_at", now);
        values.put("last_seen_at", now);
        long id = db.insertWithOnConflict("local_aliases", null, values, SQLiteDatabase.CONFLICT_IGNORE);
        if (id == -1) {
            ContentValues update = new ContentValues();
            update.put("last_seen_at", now);
            db.update("local_aliases", update, "room_key = ? AND nickname = ?", new String[] { roomKey, clean });
        }
    }

    private static long count(SQLiteDatabase db, String table) {
        return count(db, table, null);
    }

    private static long count(SQLiteDatabase db, String table, String where) {
        String sql = "SELECT COUNT(*) FROM " + table + (where == null ? "" : " WHERE " + where);
        try (Cursor cursor = db.rawQuery(sql, null)) {
            return cursor.moveToFirst() ? cursor.getLong(0) : 0;
        }
    }

    private static long eventTimeMillis(BotEvent event) {
        if (event.occurredAt == null || event.occurredAt.trim().isEmpty()) {
            return System.currentTimeMillis();
        }
        try {
            return java.time.Instant.parse(event.occurredAt).toEpochMilli();
        } catch (Exception ignored) {
            return System.currentTimeMillis();
        }
    }
}
