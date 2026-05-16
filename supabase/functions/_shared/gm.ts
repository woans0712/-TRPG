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
  ];
  const index = Math.abs([...seed].reduce((sum, ch) => sum + ch.charCodeAt(0), Date.now())) % templates.length;
  return templates[index];
}

export function fallbackVerdict(nickname: string, action: string): VerdictPayload {
  const risky = ["공격", "돌진", "문을 연", "나간", "소리"].some((word) => action.includes(word));
  const careful = ["막", "숨", "찾", "살펴", "치료", "조용"].some((word) => action.includes(word));

  if (risky) {
    return {
      result: `${nickname}의 행동은 과감했지만 위험을 키웠다. 소음이 번지고, 가까운 위협이 반응한다. 작은 부상을 입었다.`,
      hp_delta: -12,
      status: "긴장",
      world_change: "주변 위협이 플레이어들의 위치를 더 정확히 알아차렸다.",
    };
  }

  if (careful) {
    return {
      result: `${nickname}의 행동은 효과가 있었다. 완벽하진 않지만 일행에게 짧은 시간을 벌어준다.`,
      hp_delta: 0,
      status: "",
      world_change: "일행에게 준비할 시간이 조금 생겼다.",
    };
  }

  return {
    result: `${nickname}의 행동이 장면에 반영됐다. 아직 결정적인 변화는 없지만, 다음 선택의 단서가 하나 드러난다.`,
    hp_delta: 0,
    status: "",
    world_change: "상황이 천천히 다음 국면으로 넘어간다.",
  };
}

export async function openAIJson<T>(system: string, user: unknown): Promise<T | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: typeof user === "string" ? user : JSON.stringify(user) },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    console.error("OpenAI request failed", response.status, await response.text());
    return null;
  }
  const payload = await response.json();
  const text = payload.choices?.[0]?.message?.content || "";

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("OpenAI JSON parse failed", error, text);
    return null;
  }
}
