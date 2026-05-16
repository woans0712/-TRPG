from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime
from http import HTTPStatus
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).parent
PUBLIC = ROOT / "public"
DATA = Path(os.getenv("DATA_DIR", ROOT / "data"))
STATE_FILE = DATA / "state.json"

HOST = "0.0.0.0"
PORT = int(os.getenv("PORT", "8787"))
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")

LOCK = threading.RLock()
CLIENTS: set[object] = set()


DEFAULT_STATE = {
    "users": {},
    "sessions": {},
    "messages": [],
    "event": None,
    "settings": {
        "auto_events": False,
        "event_interval_minutes": 60,
        "next_event_at": None,
        "event_prompt": "현대 한국 배경의 심심풀이 생존 TRPG 이벤트를 만들어줘.",
    },
}


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def load_state() -> dict:
    DATA.mkdir(exist_ok=True)
    if not STATE_FILE.exists():
        save_state(DEFAULT_STATE.copy())
    with STATE_FILE.open("r", encoding="utf-8") as f:
        state = json.load(f)
    for key, value in DEFAULT_STATE.items():
        state.setdefault(key, value.copy() if isinstance(value, dict) else value)
    return state


def save_state(state: dict) -> None:
    DATA.mkdir(exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
    tmp.replace(STATE_FILE)


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return salt, digest.hex()


def verify_password(password: str, salt: str, digest: str) -> bool:
    _, candidate = hash_password(password, salt)
    return hmac.compare_digest(candidate, digest)


def public_user(user: dict) -> dict:
    return {
        "nickname": user["nickname"],
        "created_at": user["created_at"],
        "hp": user.get("hp", 100),
        "status": user.get("status", "정상"),
        "inventory": user.get("inventory", []),
    }


def trim_messages(state: dict) -> None:
    state["messages"] = state["messages"][-200:]


def broadcast(payload: dict) -> None:
    dead = []
    encoded = f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")
    with LOCK:
        clients = list(CLIENTS)
    for client in clients:
        try:
            client.write(encoded)
            client.flush()
        except Exception:
            dead.append(client)
    if dead:
        with LOCK:
            for client in dead:
                CLIENTS.discard(client)


def add_message(kind: str, text: str, nickname: str = "GM", meta: dict | None = None) -> dict:
    message = {
        "id": secrets.token_hex(8),
        "kind": kind,
        "nickname": nickname,
        "text": text,
        "created_at": now_iso(),
        "meta": meta or {},
    }
    with LOCK:
        state = load_state()
        state["messages"].append(message)
        trim_messages(state)
        save_state(state)
    broadcast({"type": "message", "message": message})
    return message


def fallback_event(seed: str = "") -> dict:
    templates = [
        {
            "title": "펜션에 좀비 발생",
            "scene": "저녁 식사 준비가 한창일 때, 산 아래 도로에서 비명과 함께 피투성이 사람들이 펜션 쪽으로 몰려온다. 곧이어 창문 너머로 느린 발걸음과 긁는 소리가 이어진다.",
            "stakes": "문과 창문을 지키지 못하면 내부가 뚫린다. 구조 요청은 가능하지만 통신 상태가 불안정하다.",
            "tone": "긴장감 있는 생존 호러",
        },
        {
            "title": "정전된 지하상가",
            "scene": "갑자기 모든 불이 꺼지고 셔터가 내려간다. 비상등 아래에서 안내 방송이 한 문장만 반복된다. 'B구역으로 이동하지 마십시오.'",
            "stakes": "식량, 배터리, 출구 단서를 찾아야 한다. B구역에서는 정체 모를 금속음이 들린다.",
            "tone": "미스터리 생존",
        },
        {
            "title": "마을 축제의 가면 행렬",
            "scene": "축제 행렬이 광장을 지나가던 순간, 참가자들의 가면이 피부처럼 달라붙는다. 웃음소리는 커지는데 아무도 멈추지 못한다.",
            "stakes": "가면의 규칙을 알아내지 못하면 다음 행렬에 끌려간다.",
            "tone": "기묘한 민속 괴담",
        },
    ]
    idx = int(hashlib.sha256(f"{time.time()}{seed}".encode()).hexdigest(), 16) % len(templates)
    return templates[idx]


def openai_json(system: str, user: str) -> dict | None:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    body = {
        "model": OPENAI_MODEL,
        "input": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "text": {"format": {"type": "json_object"}},
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as res:
            payload = json.loads(res.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None

    text = ""
    for item in payload.get("output", []):
        for content in item.get("content", []):
            if content.get("type") in {"output_text", "text"}:
                text += content.get("text", "")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def create_event(prompt: str) -> dict:
    system = (
        "너는 한국어 TRPG 게임마스터다. 개연성, 긴장감, 플레이어 선택의 여지를 중시한다. "
        "반드시 JSON만 반환한다."
    )
    user = (
        f"요청: {prompt}\n"
        "새 이벤트를 만들어라. JSON 스키마: "
        '{"title":"짧은 제목","scene":"첫 장면 묘사","stakes":"위험과 목표","tone":"분위기"}'
    )
    data = openai_json(system, user)
    if data and all(data.get(k) for k in ("title", "scene", "stakes", "tone")):
        return data
    return fallback_event(prompt)


def judge_action(nickname: str, action: str, state: dict) -> dict:
    event = state.get("event") or {}
    recent = state.get("messages", [])[-16:]
    system = (
        "너는 공정한 한국어 TRPG 게임마스터다. 플레이어 행동을 판정한다. "
        "즉사와 대성공을 남발하지 말고, 상황 논리와 이전 맥락을 우선한다. "
        "결과는 짧지만 장면이 살아있어야 한다. 반드시 JSON만 반환한다."
    )
    user = json.dumps(
        {
            "event": event,
            "recent_messages": recent,
            "player": nickname,
            "action": action,
            "schema": {
                "result": "플레이어에게 보여줄 판정 결과",
                "hp_delta": "정수. 피해는 음수, 회복은 양수, 변화 없으면 0",
                "status": "상태 변화. 없으면 빈 문자열",
                "world_change": "세계/장면 변화 요약",
            },
        },
        ensure_ascii=False,
    )
    data = openai_json(system, user)
    if data and data.get("result") is not None:
        return {
            "result": str(data.get("result", "")),
            "hp_delta": int(data.get("hp_delta") or 0),
            "status": str(data.get("status") or ""),
            "world_change": str(data.get("world_change") or ""),
        }

    lowered = action.lower()
    risky = any(word in lowered for word in ["공격", "돌진", "문을 연", "나간", "소리"])
    helpful = any(word in lowered for word in ["막", "숨", "찾", "살펴", "치료", "조용"])
    if risky:
        return {
            "result": f"{nickname}의 행동은 과감했지만 위험을 키웠다. 소음이 번지고, 가까운 위협이 반응한다. 작은 부상을 입었다.",
            "hp_delta": -12,
            "status": "긴장",
            "world_change": "주변 위협이 플레이어들의 위치를 더 정확히 알아차렸다.",
        }
    if helpful:
        return {
            "result": f"{nickname}의 행동은 효과가 있었다. 완벽하진 않지만 일행에게 짧은 시간을 벌어준다.",
            "hp_delta": 0,
            "status": "",
            "world_change": "일행에게 준비할 시간이 조금 생겼다.",
        }
    return {
        "result": f"{nickname}의 행동이 장면에 반영됐다. 아직 결정적인 변화는 없지만, 다음 선택의 단서가 하나 드러난다.",
        "hp_delta": 0,
        "status": "",
        "world_change": "상황이 천천히 다음 국면으로 넘어간다.",
    }


def current_snapshot(state: dict, user: dict | None = None) -> dict:
    return {
        "user": public_user(user) if user else None,
        "users": [public_user(u) for u in state["users"].values()],
        "messages": state["messages"][-80:],
        "event": state.get("event"),
        "settings": state.get("settings", {}),
        "has_openai_key": bool(os.getenv("OPENAI_API_KEY")),
    }


def background_scheduler() -> None:
    while True:
        time.sleep(5)
        with LOCK:
            state = load_state()
            settings = state.get("settings", {})
            if not settings.get("auto_events"):
                continue
            next_at = settings.get("next_event_at")
            due = not next_at or datetime.fromisoformat(next_at).timestamp() <= time.time()
            if not due:
                continue
            event = create_event(settings.get("event_prompt", "랜덤 TRPG 이벤트"))
            state["event"] = {
                **event,
                "started_at": now_iso(),
                "log": [],
            }
            interval = max(1, int(settings.get("event_interval_minutes", 60)))
            settings["next_event_at"] = datetime.fromtimestamp(time.time() + interval * 60).astimezone().isoformat(timespec="seconds")
            state["settings"] = settings
            state["messages"].append({
                "id": secrets.token_hex(8),
                "kind": "event",
                "nickname": "GM",
                "text": f"[{event['title']}]\n{event['scene']}\n\n목표/위험: {event['stakes']}",
                "created_at": now_iso(),
                "meta": event,
            })
            trim_messages(state)
            save_state(state)
        broadcast({"type": "snapshot", "snapshot": current_snapshot(load_state())})


class Handler(BaseHTTPRequestHandler):
    server_version = "TRPGSim/0.1"

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.address_string()} - {fmt % args}")

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def send_json(self, data: dict, status: int = 200) -> None:
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def send_error_json(self, message: str, status: int = 400) -> None:
        self.send_json({"ok": False, "error": message}, status)

    def get_session_user(self) -> tuple[str | None, dict | None]:
        token = self.headers.get("X-Session", "")
        with LOCK:
            state = load_state()
            nickname = state["sessions"].get(token)
            user = state["users"].get(nickname) if nickname else None
        return nickname, user

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/stream":
            self.handle_stream(parsed)
            return
        if parsed.path == "/api/snapshot":
            _, user = self.get_session_user()
            with LOCK:
                state = load_state()
            self.send_json({"ok": True, "snapshot": current_snapshot(state, user)})
            return

        path = parsed.path.strip("/") or "index.html"
        target = (PUBLIC / path).resolve()
        if PUBLIC.resolve() not in target.parents and target != PUBLIC.resolve():
            self.send_error_json("잘못된 경로입니다.", HTTPStatus.FORBIDDEN)
            return
        if not target.exists() or not target.is_file():
            self.send_error_json("파일을 찾을 수 없습니다.", HTTPStatus.NOT_FOUND)
            return
        content_type = "text/plain; charset=utf-8"
        if target.suffix == ".html":
            content_type = "text/html; charset=utf-8"
        elif target.suffix == ".css":
            content_type = "text/css; charset=utf-8"
        elif target.suffix == ".js":
            content_type = "application/javascript; charset=utf-8"
        raw = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        routes = {
            "/api/register": self.handle_register,
            "/api/login": self.handle_login,
            "/api/logout": self.handle_logout,
            "/api/message": self.handle_message,
            "/api/event": self.handle_event,
            "/api/settings": self.handle_settings,
        }
        handler = routes.get(parsed.path)
        if not handler:
            self.send_error_json("없는 API입니다.", HTTPStatus.NOT_FOUND)
            return
        try:
            handler()
        except json.JSONDecodeError:
            self.send_error_json("JSON 형식이 잘못됐습니다.")
        except Exception as exc:
            self.send_error_json(f"서버 오류: {exc}", HTTPStatus.INTERNAL_SERVER_ERROR)

    def handle_register(self) -> None:
        data = self.read_json()
        nickname = str(data.get("nickname", "")).strip()[:20]
        password = str(data.get("password", ""))
        if len(nickname) < 2 or len(password) < 4:
            self.send_error_json("닉네임은 2자 이상, 비밀번호는 4자 이상이어야 합니다.")
            return
        with LOCK:
            state = load_state()
            if nickname in state["users"]:
                self.send_error_json("이미 존재하는 닉네임입니다.")
                return
            salt, digest = hash_password(password)
            state["users"][nickname] = {
                "nickname": nickname,
                "salt": salt,
                "password_hash": digest,
                "created_at": now_iso(),
                "hp": 100,
                "status": "정상",
                "inventory": [],
            }
            token = secrets.token_urlsafe(32)
            state["sessions"][token] = nickname
            save_state(state)
            user = state["users"][nickname]
        add_message("system", f"{nickname} 님이 입장했습니다.")
        self.send_json({"ok": True, "token": token, "snapshot": current_snapshot(load_state(), user)})

    def handle_login(self) -> None:
        data = self.read_json()
        nickname = str(data.get("nickname", "")).strip()
        password = str(data.get("password", ""))
        with LOCK:
            state = load_state()
            user = state["users"].get(nickname)
            if not user or not verify_password(password, user["salt"], user["password_hash"]):
                self.send_error_json("닉네임 또는 비밀번호가 맞지 않습니다.", HTTPStatus.UNAUTHORIZED)
                return
            token = secrets.token_urlsafe(32)
            state["sessions"][token] = nickname
            save_state(state)
        self.send_json({"ok": True, "token": token, "snapshot": current_snapshot(load_state(), user)})

    def handle_logout(self) -> None:
        token = self.headers.get("X-Session", "")
        with LOCK:
            state = load_state()
            state["sessions"].pop(token, None)
            save_state(state)
        self.send_json({"ok": True})

    def handle_message(self) -> None:
        nickname, user = self.get_session_user()
        if not nickname or not user:
            self.send_error_json("로그인이 필요합니다.", HTTPStatus.UNAUTHORIZED)
            return
        data = self.read_json()
        text = str(data.get("text", "")).strip()
        if not text:
            self.send_error_json("내용을 입력하세요.")
            return
        if len(text) > 500:
            self.send_error_json("메시지는 500자 이하로 입력하세요.")
            return
        add_message("chat", text, nickname)
        with LOCK:
            state = load_state()
            if not state.get("event"):
                self.send_json({"ok": True})
                return
            verdict = judge_action(nickname, text, state)
            fresh = load_state()
            target = fresh["users"].get(nickname)
            if target:
                target["hp"] = max(0, min(100, int(target.get("hp", 100)) + verdict["hp_delta"]))
                if verdict["status"]:
                    target["status"] = verdict["status"]
            if fresh.get("event"):
                fresh["event"].setdefault("log", []).append({
                    "nickname": nickname,
                    "action": text,
                    "result": verdict["result"],
                    "world_change": verdict["world_change"],
                    "created_at": now_iso(),
                })
            save_state(fresh)
        add_message("gm", verdict["result"], "GM", verdict)
        broadcast({"type": "snapshot", "snapshot": current_snapshot(load_state())})
        self.send_json({"ok": True})

    def handle_event(self) -> None:
        nickname, user = self.get_session_user()
        if not nickname or not user:
            self.send_error_json("로그인이 필요합니다.", HTTPStatus.UNAUTHORIZED)
            return
        data = self.read_json()
        prompt = str(data.get("prompt", "")).strip() or "랜덤 TRPG 이벤트"
        event = create_event(prompt)
        with LOCK:
            state = load_state()
            state["event"] = {**event, "started_at": now_iso(), "log": []}
            save_state(state)
        add_message("event", f"[{event['title']}]\n{event['scene']}\n\n목표/위험: {event['stakes']}", "GM", event)
        broadcast({"type": "snapshot", "snapshot": current_snapshot(load_state())})
        self.send_json({"ok": True})

    def handle_settings(self) -> None:
        _, user = self.get_session_user()
        if not user:
            self.send_error_json("로그인이 필요합니다.", HTTPStatus.UNAUTHORIZED)
            return
        data = self.read_json()
        with LOCK:
            state = load_state()
            settings = state["settings"]
            settings["auto_events"] = bool(data.get("auto_events", settings.get("auto_events", False)))
            if "event_interval_minutes" in data:
                settings["event_interval_minutes"] = max(1, min(1440, int(data["event_interval_minutes"])))
            if "event_prompt" in data:
                settings["event_prompt"] = str(data["event_prompt"])[:400]
            if data.get("reset_next_event"):
                interval = int(settings.get("event_interval_minutes", 60))
                settings["next_event_at"] = datetime.fromtimestamp(time.time() + interval * 60).astimezone().isoformat(timespec="seconds")
            state["settings"] = settings
            save_state(state)
        broadcast({"type": "snapshot", "snapshot": current_snapshot(load_state())})
        self.send_json({"ok": True, "settings": settings})

    def handle_stream(self, parsed) -> None:
        query = parse_qs(parsed.query)
        token = query.get("token", [""])[0]
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        with LOCK:
            CLIENTS.add(self.wfile)
        try:
            with LOCK:
                state = load_state()
                nickname = state["sessions"].get(token)
                user = state["users"].get(nickname) if nickname else None
            payload = {"type": "snapshot", "snapshot": current_snapshot(state, user)}
            self.wfile.write(f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8"))
            self.wfile.flush()
            while True:
                time.sleep(20)
                self.wfile.write(b": keepalive\n\n")
                self.wfile.flush()
        except Exception:
            pass
        finally:
            with LOCK:
                CLIENTS.discard(self.wfile)


def main() -> None:
    threading.Thread(target=background_scheduler, daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"TRPG simulator running at http://127.0.0.1:{PORT}")
    print("Set OPENAI_API_KEY to enable GPT event/action generation.")
    server.serve_forever()


if __name__ == "__main__":
    main()
