type CommandBody = Record<string, unknown>;

type CommandDeps = {
  lookup: (body: CommandBody) => Promise<unknown>;
  linkNicknames: (body: CommandBody) => Promise<unknown>;
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

const HELP = "/\uB3C4\uC6C0";
const LOOKUP = "/\uC870\uD68C";
const HISTORY = "/\uAE30\uB85D";
const RENAMES = "/\uB2C9\uBCC0";
const LINK = "/\uC5F0\uACB0";
const GROUP = "/\uBB36\uAE30";

export const COMMANDS: AliasGroup[] = [
  {
    aliases: [HELP, "/help", "!\uB3C4\uC6C0"],
    usage: HELP,
    description: "\uBA85\uB839\uC5B4 \uBAA9\uB85D\uC744 \uBCF4\uC5EC\uC90D\uB2C8\uB2E4.",
    run: async () => helpReply(),
  },
  {
    aliases: [LOOKUP, HISTORY, RENAMES, "!\uC870\uD68C"],
    usage: `${LOOKUP} \uB2C9\uB124\uC784`,
    description: "\uB2C9\uB124\uC784 \uD788\uC2A4\uD1A0\uB9AC, \uBA54\uC2DC\uC9C0 \uC218, \uB2C9\uBCC0 \uCD94\uC801 \uACB0\uACFC\uB97C \uC870\uD68C\uD569\uB2C8\uB2E4.",
    run: async (ctx) => {
      const nickname = ctx.args.join(" ").trim();
      if (!nickname) return `\uC0AC\uC6A9\uBC95: ${ctx.command} \uB2C9\uB124\uC784`;
      const result = await ctx.deps.lookup({ ...ctx.body, nickname });
      return formatLookup(nickname, result);
    },
  },
  {
    aliases: [LINK, GROUP],
    usage: `${LINK} A B C`,
    description: "\uAC19\uC740 \uC0AC\uB78C\uC774\uB77C\uACE0 \uD655\uC815\uD55C \uB2C9\uB124\uC784\uB4E4\uC744 \uC5F0\uACB0\uD569\uB2C8\uB2E4.",
    run: async (ctx) => {
      const nicknames = ctx.args.map((item) => item.trim()).filter(Boolean);
      if (nicknames.length < 2) return `\uC0AC\uC6A9\uBC95: ${ctx.command} A B C`;
      const result = await ctx.deps.linkNicknames({ ...ctx.body, nicknames });
      return formatLink(result);
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
    return { reply: `\uC54C \uC218 \uC5C6\uB294 \uBA85\uB839\uC5B4: ${command}\n${HELP} \uC73C\uB85C \uBA85\uB839\uC5B4\uB97C \uD655\uC778\uD558\uC138\uC694.` };
  }

  const reply = await entry.run({ body, deps, command, args, rawText });
  return { reply: trimReply(reply) };
}

function helpReply() {
  return [
    "\uBA85\uB839\uC5B4",
    ...COMMANDS.map((item) => `${item.usage} - ${item.description}`),
  ].join("\n");
}

function formatLookup(query: string, raw: unknown) {
  const result = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const people = Array.isArray(result.people) ? result.people as Array<Record<string, unknown>> : [];
  if (people.length === 0) return `\uC870\uD68C \uACB0\uACFC \uC5C6\uC74C: ${query}`;

  const person = people[0];
  const out: string[] = [];
  out.push(`\uC870\uD68C: ${text(person.current_nickname)}`);
  out.push(`\uCD5C\uCD08\uB2C9: ${text(person.first_nickname)}`);
  out.push(`\uC785\uC7A5 ${number(person.join_count)} / \uD1F4\uC7A5 ${number(person.leave_count)}`);

  const aliases = Array.isArray(person.aliases) ? person.aliases as Array<Record<string, unknown>> : [];
  const aliasNames = aliases.map((alias) => text(alias.nickname)).filter(Boolean);
  const links = Array.isArray(person.nickname_links) ? person.nickname_links as Array<Record<string, unknown>> : [];
  const linkedNames = links.flatMap((link) => [text(link.old_nickname), text(link.new_nickname)]).filter(Boolean);
  const names = [...new Set([...linkedNames, ...aliasNames])].slice(-10);
  if (names.length > 0) out.push(`\uB2C9\uB124\uC784: ${names.join(", ")}`);

  const events = Array.isArray(person.events) ? person.events as Array<Record<string, unknown>> : [];
  const messageCount = events.filter((event) => text(event.event_type) === "message").length;
  out.push(`\uBA54\uC2DC\uC9C0 ${messageCount}`);

  if (links.length > 0) {
    out.push("\uB2C9\uBCC0 \uCD94\uC801:");
    for (const link of links.slice(-6)) {
      out.push(`- ${text(link.old_nickname)} -> ${text(link.new_nickname)}`);
      out.push(`  \uADFC\uAC70: ${text(link.message_text)}`);
    }
  }

  return out.join("\n");
}

function formatLink(raw: unknown) {
  const result = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const nicknames = Array.isArray(result.nicknames) ? result.nicknames.map(text).filter(Boolean) : [];
  return `\uC5F0\uACB0 \uC644\uB8CC: ${nicknames.join(" -> ")}`;
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
