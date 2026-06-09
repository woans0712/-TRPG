package com.example.kakaoopslistener;

final class BotEvent {
    final String eventType;
    final String nickname;
    final String oldNickname;
    final String newNickname;
    final String messageText;

    private BotEvent(String eventType, String nickname, String oldNickname, String newNickname, String messageText) {
        this.eventType = eventType;
        this.nickname = nickname;
        this.oldNickname = oldNickname;
        this.newNickname = newNickname;
        this.messageText = messageText;
    }

    static BotEvent join(String nickname) {
        return new BotEvent("join", nickname, "", "", "");
    }

    static BotEvent leave(String nickname) {
        return new BotEvent("leave", nickname, "", "", "");
    }

    static BotEvent rename(String oldNickname, String newNickname) {
        return new BotEvent("rename", "", oldNickname, newNickname, "");
    }

    static BotEvent message(String nickname, String messageText) {
        return new BotEvent("message", nickname, "", "", messageText);
    }
}
