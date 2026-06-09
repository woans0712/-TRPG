package com.example.kakaoopslistener;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class EventParser {
    private static final Pattern JOIN = Pattern.compile("(.+?)\\uB2D8\\uC774 \\uB4E4\\uC5B4\\uC654\\uC2B5\\uB2C8\\uB2E4");
    private static final Pattern LEAVE = Pattern.compile("(.+?)\\uB2D8\\uC774 \\uB098\\uAC14\\uC2B5\\uB2C8\\uB2E4");
    private static final Pattern RENAME = Pattern.compile("(.+?)\\uB2D8\\uC774\\s+(.+?)\\uB2D8\\uC73C\\uB85C \\uBCC0\\uACBD\\uB418\\uC5C8\\uC2B5\\uB2C8\\uB2E4");
    private static final Pattern MESSAGE_WITH_COLON = Pattern.compile("(.+?)\\s*[:\\uFF1A]\\s*(.+)");

    private EventParser() {}

    static BotEvent parse(String title, String text, String bigText) {
        String combined = join(title, text, bigText);

        Matcher rename = RENAME.matcher(combined);
        if (rename.find()) {
            return BotEvent.rename(clean(rename.group(1)), clean(rename.group(2)));
        }

        Matcher join = JOIN.matcher(combined);
        if (join.find()) {
            return BotEvent.join(clean(join.group(1)));
        }

        Matcher leave = LEAVE.matcher(combined);
        if (leave.find()) {
            return BotEvent.leave(clean(leave.group(1)));
        }

        Matcher message = MESSAGE_WITH_COLON.matcher(text == null ? "" : text);
        if (message.matches()) {
            return BotEvent.message(clean(message.group(1)), clean(message.group(2)));
        }

        if (looksLikeNickname(title) && text != null && !text.trim().isEmpty()) {
            return BotEvent.message(clean(title), clean(text));
        }

        return null;
    }

    private static String join(String title, String text, String bigText) {
        StringBuilder builder = new StringBuilder();
        append(builder, title);
        append(builder, text);
        append(builder, bigText);
        return builder.toString();
    }

    private static void append(StringBuilder builder, String value) {
        if (value == null || value.trim().isEmpty()) return;
        if (builder.length() > 0) builder.append('\n');
        builder.append(value.trim());
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim().replaceAll("\\s+", " ");
    }

    private static boolean looksLikeNickname(String value) {
        if (value == null) return false;
        String trimmed = value.trim();
        if (trimmed.length() < 1 || trimmed.length() > 40) return false;
        return !trimmed.contains("\uCE74\uCE74\uC624\uD1A1") && !trimmed.contains("\uC624\uD508\uCC44\uD305");
    }
}
