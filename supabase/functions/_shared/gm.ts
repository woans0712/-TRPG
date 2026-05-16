export type EventPayload = {
  title: string;
  scene: string;
  stakes: string;
  tone: string;
};

export type VerdictPayload = {
  result: string;
  hp_delta: number;
  status: string;
  world_change: string;
};

export function fallbackEvent(seed = ""): EventPayload {
  const templates = [
    {
      title: "펜션에 좀비 발생",
      scene:
        "저녁 식사 준비가 한창일 때, 산 아래 도로에서 비명과 함께 피투성이 사람들이 펜션 쪽으로 몰려온다. 창문 너머로 느린 발걸음과 긁는 소리가 이어진다.",
      stakes: "문과 창문을 지키지 못하면 내부가 뚫린다. 구조 요청은 가능하지만 통신 상태가 불안정하다.",
      tone: "긴장감 있는 생존 호러",
    },
    {
      title: "정전된 지하상가",
      scene:
        "갑자기 모든 불이 꺼지고 셔터가 내려간다. 비상등 아래에서 안내 방송이 한 문장만 반복된다. 'B구역으로 이동하지 마십시오.'",
      stakes: "식량, 배터리, 출구 단서를 찾아야 한다. B구역에서는 정체 모를 금속음이 들린다.",
      tone: "미스터리 생존",
    },
    {
      title: "마을 축제의 가면 행렬",
      scene:
        "축제 행렬이 광장을 지나가던 순간, 참가자들의 가면이 피부처럼 달라붙는다. 웃음소리는 커지는데 아무도 멈추지 못한다.",
      stakes: "가면의 규칙을 알아내지 못하면 다음 행렬에 끌려간다.",
      tone: "기묘한 민속 괴담",
    },
    {
      title: "새벽 배송 물류센터의 13번 벨트",
      scene:
        "새벽 2시, 멈춰 있어야 할 13번 컨베이어 벨트가 혼자 움직인다. 송장 없는 상자들이 줄지어 나오고, 상자 안쪽에서는 누군가 손톱으로 박스를 긁는 소리가 난다.",
      stakes: "벨트를 멈추거나 상자의 출처를 알아내지 못하면 물류센터 전체가 봉쇄된다. CCTV는 13분 전 화면만 반복한다.",
      tone: "현대 괴담과 밀실 생존",
    },
    {
      title: "호수 위 민박집의 두 번째 달",
      scene:
        "비가 그친 뒤 호수 위에 달이 두 개 떠 있다. 민박집 주인은 창문을 모두 가리라고 말하지만, 이미 누군가 물가에서 일행의 이름을 하나씩 부르고 있다.",
      stakes: "두 번째 달을 직접 보면 기억 일부가 바뀐다. 물가의 목소리가 누구를 흉내 내는지 밝혀야 한다.",
      tone: "서정적인 오컬트 미스터리",
    },
    {
      title: "마지막 열차의 무임승객",
      scene:
        "막차 안 전광판이 존재하지 않는 역 이름을 표시한다. 다음 역 안내음이 울릴 때마다 승객 중 한 명의 그림자가 좌석에 남고 몸은 사라진다.",
      stakes: "다음 정차 전까지 규칙을 알아내거나 운전실에 접근해야 한다. 잘못 내리면 돌아오는 열차가 없다.",
      tone: "도시 괴담 추리",
    },
    {
      title: "폐교 방송반의 녹음 테이프",
      scene:
        "폐교 체험을 시작한 순간 스피커에서 방금 전 일행의 대화가 거꾸로 재생된다. 방송실 문틈 아래로 오래된 카세트테이프가 하나씩 밀려 나온다.",
      stakes: "테이프 순서를 맞추면 출구가 열릴 수 있지만, 재생할 때마다 아직 일어나지 않은 사고가 하나씩 확정된다.",
      tone: "시간 꼬임 공포",
    },
    {
      title: "편의점 야간 근무자의 금지 영수증",
      scene:
        "자정이 지나자 손님 없는 편의점 계산대에서 영수증이 계속 출력된다. 영수증에는 일행이 아직 하지 않은 행동과 사망 시간이 적혀 있다.",
      stakes: "영수증의 예언을 바꾸려면 물건 배치와 CCTV 사각지대를 이용해야 한다. 하나를 바꾸면 다른 항목이 새로 찍힌다.",
      tone: "블랙코미디 생존 스릴러",
    },
  ];
  const index = Math.abs([...seed].reduce((sum, ch) => sum + ch.charCodeAt(0), Date.now())) % templates.length;
  return templates[index];
}

export function fallbackVerdict(nickname: string, action: string, event?: Partial<EventPayload>): VerdictPayload {
  const risky = ["공격", "돌진", "문을 연", "나간", "소리"].some((word) => action.includes(word));
  const careful = ["막", "숨", "찾", "살펴", "치료", "조용"].some((word) => action.includes(word));
  const title = event?.title ? `「${event.title}」에서 ` : "";

  if (risky) {
    return {
      result: `[임시 GM] ${title}${nickname}의 행동은 즉각적인 반응을 불러왔다. ${action} 때문에 주변의 시선과 소음이 한곳으로 모이고, 숨어 있던 위험이 일행의 위치를 더 또렷하게 알아차린다. 작은 부상을 입었지만, 대신 위협이 반응하는 방향과 속도라는 단서를 얻었다. 다음 선택은 빠르게 몸을 숨기거나, 이 반응을 역이용해 함정을 만드는 것이다.`,
      hp_delta: -12,
      status: "긴장",
      world_change: "주변 위협이 플레이어들의 위치를 더 정확히 알아차렸다.",
    };
  }

  if (careful) {
    return {
      result: `[임시 GM] ${title}${nickname}의 행동은 조심스럽게 장면을 바꿨다. ${action} 덕분에 일행은 당장 덮쳐오는 위험에서 몇 초의 여유를 벌고, 주변을 살필 틈을 얻는다. 완벽한 해결은 아니지만, 근처에서 반복되는 소리나 어긋난 물건처럼 다음 단서로 이어질 만한 흔적이 눈에 들어온다. 이제 그 단서를 조사할지, 안전한 위치를 먼저 확보할지 선택해야 한다.`,
      hp_delta: 0,
      status: "",
      world_change: "일행에게 준비할 시간이 조금 생겼다.",
    };
  }

  return {
    result: `[임시 GM] ${title}${nickname}의 행동은 사소해 보였지만 장면의 균형을 흔들었다. ${action}이 끝나자 주변의 공기와 사람들의 반응이 미묘하게 달라지고, 방금 전까지 보이지 않던 단서 하나가 드러난다. 그것은 아직 정답은 아니지만, 현재 사건의 규칙을 이해할 실마리다. 다음에는 그 단서를 파고들거나, 위험을 감수하고 더 직접적인 행동을 할 수 있다.`,
    hp_delta: 0,
    status: "",
    world_change: "상황이 천천히 다음 국면으로 넘어간다.",
  };
}

export async function openAIJson<T>(system: string, user: unknown): Promise<T | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-4.1-nano",
      temperature: 0.8,
      max_tokens: 360,
        messages: [
          { role: "system", content: system },
          { role: "user", content: typeof user === "string" ? user : JSON.stringify(user) },
        ],
        response_format: { type: "json_object" },
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("OpenAI 응답 시간이 30초를 넘었습니다. 행동을 조금 짧게 입력하거나 다시 시도해주세요.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI request failed", response.status, errorText);
    let message = errorText;
    try {
      const parsed = JSON.parse(errorText);
      message = parsed.error?.message || errorText;
    } catch {
      // Keep raw text.
    }
    throw new Error(`OpenAI 호출 실패 (${response.status}): ${message}`);
  }
  const payload = await response.json();
  const text = payload.choices?.[0]?.message?.content || "";

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("OpenAI JSON parse failed", error, text);
    throw new Error("OpenAI 응답을 JSON으로 해석하지 못했습니다.");
  }
}
