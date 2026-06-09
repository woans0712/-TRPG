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
        subtitle.setText("카카오톡 알림에 보이는 공개 이벤트만 Supabase로 전송합니다.");
        subtitle.setTextSize(14);
        subtitle.setPadding(0, 8, 0, 24);
        root.addView(subtitle, matchWrap());

        endpointInput = input("Endpoint", SettingsStore.endpoint(this));
        tokenInput = input("x-bot-token", SettingsStore.token(this));
        roomKeyInput = input("room_key", SettingsStore.roomKey(this));
        root.addView(endpointInput, matchWrap());
        root.addView(tokenInput, matchWrap());
        root.addView(roomKeyInput, matchWrap());

        Button save = new Button(this);
        save.setText("저장");
        save.setOnClickListener(view -> {
            SettingsStore.save(
                this,
                endpointInput.getText().toString(),
                tokenInput.getText().toString(),
                roomKeyInput.getText().toString()
            );
            Toast.makeText(this, "저장됨", Toast.LENGTH_SHORT).show();
        });
        root.addView(save, matchWrap());

        Button permission = new Button(this);
        permission.setText("알림 접근 권한 열기");
        permission.setOnClickListener(view -> startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
        root.addView(permission, matchWrap());

        Button test = new Button(this);
        test.setText("테스트 입장 이벤트 보내기");
        test.setOnClickListener(view -> sendTest());
        root.addView(test, matchWrap());

        statusText = new TextView(this);
        statusText.setText("설정 저장 후 알림 접근 권한에서 이 앱을 허용하세요.");
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

    private void sendTest() {
        SettingsStore.save(
            this,
            endpointInput.getText().toString(),
            tokenInput.getText().toString(),
            roomKeyInput.getText().toString()
        );
        statusText.setText("테스트 전송 중...");
        executor.execute(() -> {
            try {
                String response = BotClient.send(this, BotEvent.join("테스트유저"));
                runOnUiThread(() -> statusText.setText("테스트 성공\n" + response));
            } catch (Exception error) {
                runOnUiThread(() -> statusText.setText("테스트 실패\n" + error.getMessage()));
            }
        });
    }
}
