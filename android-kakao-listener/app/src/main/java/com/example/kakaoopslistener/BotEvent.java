package com.example.kakaoopslistener;

final class BotEvent {
    final String eventType;
    final String nickname;
    final String oldNickname;
    final String newNickname;
    final String messageText;
    final String occurredAt;

    private BotEvent(String eventType, String nickname, String oldNickname, String newNickname, String messageText, String occurredAt) {
        this.eventType = eventType;
        this.nickname = nickname;
        this.oldNickname = oldNickname;
        this.newNickname = newNickname;
        this.messageText = messageText;
        this.occurredAt = occurredAt;
    }

    static BotEvent join(String nickname) {
        return new BotEvent("join", nickname, "", "", "", "");
    }

    static BotEvent leave(String nickname) {
        return new BotEvent("leave", nickname, "", "", "", "");
    }

    static BotEvent rename(String oldNickname, String newNickname) {
        return new BotEvent("rename", "", oldNickname, newNickname, "", "");
    }

    static BotEvent message(String nickname, String messageText) {
        return message(nickname, messageText, "");
    }

    static BotEvent message(String nickname, String messageText, String occurredAt) {
        return new BotEvent("message", nickname, "", "", messageText, occurredAt);
    }

    String displayName() {
        if (!nickname.isEmpty()) return nickname;
        if (!newNickname.isEmpty()) return newNickname;
        return oldNickname;
    }
}
