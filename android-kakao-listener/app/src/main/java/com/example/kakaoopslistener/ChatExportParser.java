package com.example.kakaoopslistener;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class ChatExportParser {
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final Pattern DATE_KO = Pattern.compile(".*?(\\d{4})\\s*\\uB144\\s*(\\d{1,2})\\s*\\uC6D4\\s*(\\d{1,2})\\s*\\uC77C.*");
    private static final Pattern BRACKET_MESSAGE = Pattern.compile("^\\[(.+?)\\]\\s*\\[(\\uC624\\uC804|\\uC624\\uD6C4)\\s*(\\d{1,2}):(\\d{2})\\]\\s*(.*)$");
    private static final Pattern COMMA_MESSAGE = Pattern.compile("^(\\d{4})\\.\\s*(\\d{1,2})\\.\\s*(\\d{1,2})\\.\\s*(\\uC624\\uC804|\\uC624\\uD6C4)\\s*(\\d{1,2}):(\\d{2}),\\s*(.+?)\\s*:\\s*(.*)$");
    private static final Pattern KOREAN_COMMA_MESSAGE = Pattern.compile("^(\\d{4})\\s*\\uB144\\s*(\\d{1,2})\\s*\\uC6D4\\s*(\\d{1,2})\\s*\\uC77C\\s*(\\uC624\\uC804|\\uC624\\uD6C4)\\s*(\\d{1,2}):(\\d{2}),\\s*(.+?)\\s*:\\s*(.*)$");
    private static final Pattern DASH_COMMA_MESSAGE = Pattern.compile("^(\\d{4})-(\\d{1,2})-(\\d{1,2})\\s*(\\uC624\\uC804|\\uC624\\uD6C4)\\s*(\\d{1,2}):(\\d{2}),\\s*(.+?)\\s*:\\s*(.*)$");
    private static final Pattern TIME_COMMA_MESSAGE = Pattern.compile("^(\\uC624\\uC804|\\uC624\\uD6C4)\\s*(\\d{1,2}):(\\d{2}),\\s*(.+?)\\s*:\\s*(.*)$");

    private ChatExportParser() {}

    static List<ImportedMessage> parse(String text) {
        List<ImportedMessage> messages = new ArrayList<>();
        LocalDate currentDate = null;
        ImportedMessage last = null;

        String[] lines = text.replace("\r\n", "\n").replace('\r', '\n').split("\n");
        for (String rawLine : lines) {
            String line = rawLine.trim();
            if (line.isEmpty()) continue;

            Matcher dateMatcher = DATE_KO.matcher(line);
            if (dateMatcher.matches()) {
                currentDate = LocalDate.of(
                    Integer.parseInt(dateMatcher.group(1)),
                    Integer.parseInt(dateMatcher.group(2)),
                    Integer.parseInt(dateMatcher.group(3))
                );
                last = null;
                continue;
            }

            Matcher comma = COMMA_MESSAGE.matcher(line);
            if (comma.matches()) {
                last = buildFromDatedLine(comma);
                messages.add(last);
                continue;
            }

            Matcher koreanComma = KOREAN_COMMA_MESSAGE.matcher(line);
            if (koreanComma.matches()) {
                last = buildFromDatedLine(koreanComma);
                messages.add(last);
                continue;
            }

            Matcher dashComma = DASH_COMMA_MESSAGE.matcher(line);
            if (dashComma.matches()) {
                last = buildFromDatedLine(dashComma);
                messages.add(last);
                continue;
            }

            Matcher bracket = BRACKET_MESSAGE.matcher(line);
            if (bracket.matches() && currentDate != null) {
                last = build(currentDate, bracket.group(2), bracket.group(3), bracket.group(4), bracket.group(1), bracket.group(5));
                messages.add(last);
                continue;
            }

            Matcher timeComma = TIME_COMMA_MESSAGE.matcher(line);
            if (timeComma.matches() && currentDate != null) {
                last = build(currentDate, timeComma.group(1), timeComma.group(2), timeComma.group(3), timeComma.group(4), timeComma.group(5));
                messages.add(last);
                continue;
            }

            if (last != null && !looksLikeSystemLine(line)) {
                ImportedMessage merged = new ImportedMessage(last.nickname, last.messageText + "\n" + line, last.occurredAt);
                messages.set(messages.size() - 1, merged);
                last = merged;
            }
        }
        return messages;
    }

    private static ImportedMessage buildFromDatedLine(Matcher matcher) {
        LocalDate date = LocalDate.of(
            Integer.parseInt(matcher.group(1)),
            Integer.parseInt(matcher.group(2)),
            Integer.parseInt(matcher.group(3))
        );
        return build(date, matcher.group(4), matcher.group(5), matcher.group(6), matcher.group(7), matcher.group(8));
    }

    private static ImportedMessage build(LocalDate date, String ampm, String hourText, String minuteText, String nickname, String message) {
        int hour = Integer.parseInt(hourText);
        int minute = Integer.parseInt(minuteText);
        if ("\uC624\uD6C4".equals(ampm) && hour < 12) hour += 12;
        if ("\uC624\uC804".equals(ampm) && hour == 12) hour = 0;
        LocalDateTime time = date.atTime(hour, minute);
        String occurredAt = DateTimeFormatter.ISO_INSTANT.format(time.atZone(KST).toInstant());
        return new ImportedMessage(clean(nickname), clean(message), occurredAt);
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim().replaceAll("\\s+", " ");
    }

    private static boolean looksLikeSystemLine(String line) {
        return line.startsWith("---------------")
            || line.contains("\uB2D8\uC774 \uB4E4\uC5B4\uC654\uC2B5\uB2C8\uB2E4")
            || line.contains("\uB2D8\uC774 \uB098\uAC14\uC2B5\uB2C8\uB2E4");
    }
}
