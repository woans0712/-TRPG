package com.example.kakaoopslistener;

final class ImportedMessage {
    final String nickname;
    final String messageText;
    final String occurredAt;

    ImportedMessage(String nickname, String messageText, String occurredAt) {
        this.nickname = nickname;
        this.messageText = messageText;
        this.occurredAt = occurredAt;
    }
}
