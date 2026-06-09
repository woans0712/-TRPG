package com.example.kakaoopslistener;

import android.app.Activity;
import android.content.Intent;
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

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
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
}
