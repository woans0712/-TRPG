package com.example.kakaoopslistener;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int PICK_CHAT_EXPORT = 42;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private EditText endpointInput;
    private EditText tokenInput;
    private EditText roomKeyInput;
    private TextView statusText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(36, 36, 36, 36);
        scroll.addView(root);

        TextView title = new TextView(this);
        title.setText("Kakao Ops Listener");
        title.setTextSize(24);
        title.setGravity(Gravity.START);
        root.addView(title, matchWrap());

        TextView subtitle = new TextView(this);
        subtitle.setText("Stores Kakao notification events locally, then syncs them to Supabase.");
        subtitle.setTextSize(14);
        subtitle.setPadding(0, 8, 0, 24);
        root.addView(subtitle, matchWrap());

        endpointInput = input("Endpoint", SettingsStore.endpoint(this));
        tokenInput = input("x-bot-token", SettingsStore.token(this));
        roomKeyInput = input("fallback room_key", SettingsStore.roomKey(this));
        root.addView(endpointInput, matchWrap());
        root.addView(tokenInput, matchWrap());
        root.addView(roomKeyInput, matchWrap());

        Button save = new Button(this);
        save.setText("Save settings");
        save.setOnClickListener(view -> {
            saveSettings();
            Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show();
        });
        root.addView(save, matchWrap());

        Button permission = new Button(this);
        permission.setText("Open notification access");
        permission.setOnClickListener(view -> startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
        root.addView(permission, matchWrap());

        Button test = new Button(this);
        test.setText("Send test join event");
        test.setOnClickListener(view -> sendTest());
        root.addView(test, matchWrap());

        Button localSummary = new Button(this);
        localSummary.setText("Show local DB summary");
        localSummary.setOnClickListener(view -> statusText.setText(LocalEventStore.summary(this)));
        root.addView(localSummary, matchWrap());

        Button importExport = new Button(this);
        importExport.setText("Import Kakao chat export");
        importExport.setOnClickListener(view -> pickChatExport());
        root.addView(importExport, matchWrap());

        statusText = new TextView(this);
        statusText.setText("Save settings, allow notification access, then keep Kakao notifications enabled.");
        statusText.setPadding(0, 24, 0, 0);
        root.addView(statusText, matchWrap());

        setContentView(scroll);
    }

    private EditText input(String hint, String value) {
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setSingleLine(true);
        input.setText(value);
        input.setPadding(0, 12, 0, 12);
        return input;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
    }

    private void saveSettings() {
        SettingsStore.save(
            this,
            endpointInput.getText().toString(),
            tokenInput.getText().toString(),
            roomKeyInput.getText().toString()
        );
    }

    private void sendTest() {
        saveSettings();
        String roomKey = SettingsStore.roomKey(this);
        String dedupeKey = "manual-test|" + System.currentTimeMillis();
        BotEvent event = BotEvent.join("test-user");
        LocalEventStore.save(this, roomKey, event, dedupeKey, "manual_test");

        statusText.setText("Sending test...");
        executor.execute(() -> {
            try {
                String response = BotClient.send(this, roomKey, event);
                LocalEventStore.markSent(this, dedupeKey);
                runOnUiThread(() -> statusText.setText("Test success\n" + response));
            } catch (Exception error) {
                runOnUiThread(() -> statusText.setText("Test failed\n" + error.getMessage()));
            }
        });
    }

    private void pickChatExport() {
        saveSettings();
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("text/*");
        startActivityForResult(intent, PICK_CHAT_EXPORT);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_CHAT_EXPORT || resultCode != RESULT_OK || data == null || data.getData() == null) {
            return;
        }
        importChatExport(data.getData());
    }

    private void importChatExport(Uri uri) {
        saveSettings();
        String roomKey = SettingsStore.roomKey(this);
        statusText.setText("Importing chat export...");
        executor.execute(() -> {
            try {
                byte[] bytes = readBytes(uri);
                ImportParseResult parseResult = parseBest(bytes);
                List<ImportedMessage> messages = parseResult.messages;
                int saved = 0;
                int sent = 0;
                int skipped = 0;
                int failed = 0;

                for (ImportedMessage message : messages) {
                    if (message.nickname.isEmpty() || message.messageText.isEmpty()) {
                        skipped += 1;
                        continue;
                    }
                    BotEvent event = BotEvent.message(message.nickname, message.messageText, message.occurredAt);
                    String dedupeKey = "chat_export|" + roomKey + "|" + message.occurredAt + "|" + sha256(message.nickname + "\n" + message.messageText);
                    long rowId = LocalEventStore.save(this, roomKey, event, dedupeKey, "chat_export");
                    if (rowId == -1) {
                        skipped += 1;
                        continue;
                    }
                    saved += 1;
                    try {
                        BotClient.send(this, roomKey, event, "chat_export", dedupeKey);
                        LocalEventStore.markSent(this, dedupeKey);
                        sent += 1;
                    } catch (Exception error) {
                        failed += 1;
                    }
                }

                int finalSaved = saved;
                int finalSent = sent;
                int finalSkipped = skipped;
                int finalFailed = failed;
                int parsed = messages.size();
                runOnUiThread(() -> statusText.setText(
                    "Import done\nparsed=" + parsed
                        + ", saved=" + finalSaved
                        + ", sent=" + finalSent
                        + ", skipped=" + finalSkipped
                        + ", failed=" + finalFailed
                        + "\n" + parseResult.debug
                ));
            } catch (Exception error) {
                runOnUiThread(() -> statusText.setText("Import failed\n" + error.getMessage()));
            }
        });
    }

    private byte[] readBytes(Uri uri) throws Exception {
        try (InputStream input = getContentResolver().openInputStream(uri)) {
            if (input == null) throw new IllegalStateException("Could not open selected file.");
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private ImportParseResult parseBest(byte[] bytes) {
        Charset[] charsets = new Charset[] {
            StandardCharsets.UTF_8,
            Charset.forName("MS949"),
            Charset.forName("EUC-KR"),
            StandardCharsets.UTF_16,
            StandardCharsets.UTF_16LE,
            StandardCharsets.UTF_16BE
        };

        StringBuilder debug = new StringBuilder();
        debug.append("bytes=").append(bytes.length);
        List<ImportedMessage> best = ChatExportParser.parse(new String(bytes, StandardCharsets.UTF_8));
        String bestCharset = StandardCharsets.UTF_8.name();
        String bestText = new String(bytes, StandardCharsets.UTF_8);
        for (Charset charset : charsets) {
            String text = new String(bytes, charset);
            List<ImportedMessage> parsed = ChatExportParser.parse(text);
            debug.append("\n").append(charset.name()).append(" parsed=").append(parsed.size());
            if (parsed.size() > best.size()) {
                best = parsed;
                bestCharset = charset.name();
                bestText = text;
            }
        }
        debug.append("\nbest=").append(bestCharset);
        debug.append("\nfirst=").append(firstLines(bestText));
        return new ImportParseResult(best, debug.toString());
    }

    private static String firstLines(String text) {
        String[] lines = text.replace("\r\n", "\n").replace('\r', '\n').split("\n");
        StringBuilder result = new StringBuilder();
        int count = 0;
        for (String raw : lines) {
            String line = raw.trim();
            if (line.isEmpty()) continue;
            if (result.length() > 0) result.append(" | ");
            result.append(line.length() > 70 ? line.substring(0, 70) : line);
            count += 1;
            if (count >= 3) break;
        }
        return result.toString();
    }

    private static final class ImportParseResult {
        final List<ImportedMessage> messages;
        final String debug;

        ImportParseResult(List<ImportedMessage> messages, String debug) {
            this.messages = messages;
            this.debug = debug;
        }
    }

    private static String sha256(String value) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder();
        for (byte b : hash) result.append(String.format("%02x", b));
        return result.toString();
    }
}
