type CommandBody = Record<string, unknown>;

type CommandDeps = {
  lookup: (body: CommandBody) => Promise<unknown>;
};

type AliasGroup = {
  aliases: string[];
  usage: string;
  description: string;
  run: (ctx: CommandContext) => Promise<string>;
};

type CommandContext = {
  body: CommandBody;
  deps: CommandDeps;
  command: string;
  args: string[];
  rawText: string;
};

const maxReplyLength = 900;

// Edit this list when you want to add, remove, or rename bot commands.
export const COMMANDS: AliasGroup[] = [
  {
    aliases: ["/도움", "/help", "!도움"],
    usage: "/도움",
    description: "명령어 목록을 보여줍니다.",
    run: async () => helpReply(),
  },
  {
    aliases: ["/조회", "/기록", "/닉변", "!조회"],
    usage: "/조회 닉네임",
    description: "닉네임 히스토리, 입퇴장 횟수, 최근 메모를 조회합니다.",
    run: async (ctx) => {
      const nickname = ctx.args[0];
      if (!nickname) return `사용법: ${ctx.command} 닉네임`;
      const result = await ctx.deps.lookup({ ...ctx.body, nickname });
      return formatLookup(nickname, result);
    },
  },
];

export function isCommandText(value: unknown) {
  const text = String(value || "").trim();
  return text.startsWith("/") || text.startsWith("!");
}

export async function handleCommand(body: CommandBody, deps: CommandDeps) {
  const rawText = String(body.message_text || body.command_text || "").trim();
  if (!isCommandText(rawText)) return { reply: null };

  const [command, ...args] = rawText.split(/\s+/);
  const entry = COMMANDS.find((item) => item.aliases.includes(command));
  if (!entry) {
    return { reply: `알 수 없는 명령어: ${command}\n/도움 으로 명령어를 확인하세요.` };
  }

  const reply = await entry.run({ body, deps, command, args, rawText });
  return { reply: trimReply(reply) };
}

function helpReply() {
  return [
    "명령어",
    ...COMMANDS.map((item) => `${item.usage} - ${item.description}`),
  ].join("\n");
}

function formatLookup(query: string, raw: unknown) {
  const result = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const people = Array.isArray(result.people) ? result.people as Array<Record<string, unknown>> : [];
  if (people.length === 0) return `조회 결과 없음: ${query}`;

  const person = people[0];
  const out: string[] = [];
  out.push(`조회: ${text(person.current_nickname)}`);
  out.push(`최초닉: ${text(person.first_nickname)}`);
  out.push(`입장 ${number(person.join_count)} / 퇴장 ${number(person.leave_count)}`);

  const aliases = Array.isArray(person.aliases) ? person.aliases as Array<Record<string, unknown>> : [];
  const names = [...new Set(aliases.map((alias) => text(alias.nickname)).filter(Boolean))].slice(0, 6);
  if (names.length > 0) out.push(`닉네임: ${names.join(", ")}`);

  const events = Array.isArray(person.events) ? person.events as Array<Record<string, unknown>> : [];
  const renameEvents = events.filter((event) => text(event.event_type) === "rename").slice(0, 3);
  if (renameEvents.length > 0) {
    out.push("닉변:");
    for (const event of renameEvents) {
      out.push(`- ${text(event.old_nickname)} -> ${text(event.new_nickname)}`);
    }
  }

  const notes = Array.isArray(person.notes) ? person.notes as Array<Record<string, unknown>> : [];
  if (notes.length > 0) {
    const note = notes[0];
    out.push(`최근메모[${text(note.severity)}]: ${text(note.note)}`);
  }

  return out.join("\n");
}

function trimReply(value: string) {
  return value.length > maxReplyLength ? value.slice(0, maxReplyLength) : value;
}

function text(value: unknown) {
  return String(value || "").trim();
}

function number(value: unknown) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}
