// MessengerR-only Kakao relay.

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
  ensureDiscordRelayStarted();

  if (!isAllowedRoom(room)) return;

  var text = String(msg || "").trim();
  if (text === "/핑" || text === "!핑" || text === "/ping" || text === "!ping") {
    replier.reply("뚜비랜드 릴레이 작동중");
  }
}

var SETTINGS_PATH = "/sdcard/msgbot/Bots/뚜비/bot-settings.json";
var DEFAULT_SETTINGS = {
  messengerR: {
    allowedRooms: ["뚜비랜드"],
    discordRelay: {
      enabled: true,
      targetRoom: "뚜비랜드",
      queuePath: "/sdcard/msgbot/Bots/뚜비/discord-kakao-queue.jsonl",
      processedPath: "/sdcard/msgbot/Bots/뚜비/discord-kakao-processed.json",
      pollSeconds: 5,
      maxMessagesPerTick: 5
    }
  }
};

var __discordRelayStarted = false;

function readSettings() {
  try {
    var file = new java.io.File(SETTINGS_PATH);
    if (!file.exists()) return DEFAULT_SETTINGS;
    var body = readTextFile(file);
    if (!body) return DEFAULT_SETTINGS;
    return mergeSettings(DEFAULT_SETTINGS, JSON.parse(stripBom(body)));
  } catch (error) {
    logDebug("settings read error: " + error);
    return DEFAULT_SETTINGS;
  }
}

function mergeSettings(base, extra) {
  if (!extra) return base;
  var result = JSON.parse(JSON.stringify(base));
  if (extra.messengerR) {
    for (var key in extra.messengerR) {
      result.messengerR[key] = extra.messengerR[key];
    }
    if (extra.messengerR.discordRelay) {
      result.messengerR.discordRelay = result.messengerR.discordRelay || {};
      for (var relayKey in extra.messengerR.discordRelay) {
        result.messengerR.discordRelay[relayKey] = extra.messengerR.discordRelay[relayKey];
      }
    }
  }
  return result;
}

function isAllowedRoom(room) {
  var rooms = (readSettings().messengerR || {}).allowedRooms || [];
  if (!rooms.length) return true;
  var current = cleanText(room);
  for (var index = 0; index < rooms.length; index += 1) {
    if (cleanText(rooms[index]) === current) return true;
  }
  return false;
}

function ensureDiscordRelayStarted() {
  if (__discordRelayStarted) return;
  __discordRelayStarted = true;

  var thread = new java.lang.Thread(new java.lang.Runnable({
    run: function () {
      while (true) {
        try {
          pollDiscordRelayQueue();
        } catch (error) {
          logDebug("discord relay poll error: " + error);
        }

        try {
          var seconds = readRelayConfig().pollSeconds || 5;
          java.lang.Thread.sleep(Math.max(1, seconds) * 1000);
        } catch (sleepError) {
          java.lang.Thread.sleep(5000);
        }
      }
    }
  }));
  thread.setDaemon(true);
  thread.start();
}

function pollDiscordRelayQueue() {
  var config = readRelayConfig();
  if (!config.enabled) return;
  if (typeof Api === "undefined" || !Api.replyRoom) return;

  var queueFile = new java.io.File(config.queuePath);
  if (!queueFile.exists()) return;

  var lines = String(readTextFile(queueFile) || "").split(/\r?\n/);
  var processed = readProcessedState(config.processedPath);
  var max = Number(config.maxMessagesPerTick || 5);
  var sent = 0;

  for (var index = 0; index < lines.length; index += 1) {
    var line = String(lines[index] || "").trim();
    if (!line) continue;

    var item;
    try {
      item = JSON.parse(line);
    } catch (parseError) {
      continue;
    }

    var id = String(item.id || "");
    if (!id || processed[id]) continue;

    var room = cleanText(item.targetRoom || config.targetRoom || "뚜비랜드");
    if (!room) continue;

    Api.replyRoom(room, formatDiscordRelayMessage(item));
    processed[id] = nowText();
    sent += 1;

    if (sent >= max) break;
  }

  if (sent > 0) writeProcessedState(config.processedPath, processed);
}

function readRelayConfig() {
  var settings = readSettings();
  return ((settings.messengerR || {}).discordRelay || DEFAULT_SETTINGS.messengerR.discordRelay);
}

function formatDiscordRelayMessage(item) {
  var parts = [];
  parts.push("[디스코드 모집글]");
  if (item.author) parts.push("작성자: " + item.author);
  if (item.content) parts.push(String(item.content));
  if (item.attachments && item.attachments.length) {
    parts.push("첨부: " + item.attachments.join("\n"));
  }
  if (item.jumpUrl) parts.push("원문: " + item.jumpUrl);
  return parts.join("\n");
}

function readProcessedState(path) {
  try {
    var file = new java.io.File(path);
    if (!file.exists()) return {};
    return JSON.parse(stripBom(readTextFile(file) || "{}"));
  } catch (error) {
    return {};
  }
}

function writeProcessedState(path, state) {
  writeTextFile(path, JSON.stringify(state));
}

function readTextFile(file) {
  var reader = new java.io.BufferedReader(
    new java.io.InputStreamReader(new java.io.FileInputStream(file), "UTF-8")
  );
  var builder = new java.lang.StringBuilder();
  var line;
  while ((line = reader.readLine()) !== null) {
    builder.append(line).append("\n");
  }
  reader.close();
  return String(builder.toString());
}

function writeTextFile(path, text) {
  var file = new java.io.File(path);
  var parent = file.getParentFile();
  if (parent && !parent.exists()) parent.mkdirs();
  var writer = new java.io.OutputStreamWriter(new java.io.FileOutputStream(file), "UTF-8");
  writer.write(String(text || ""));
  writer.close();
}

function stripBom(text) {
  return String(text || "").replace(/^\uFEFF/, "");
}

function cleanText(value) {
  return String(value || "").trim();
}

function nowText() {
  return String(new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new java.util.Date()));
}

function logDebug(message) {
  try {
    if (typeof Log !== "undefined" && Log.d) Log.d(String(message));
  } catch (ignored) {
  }
}

ensureDiscordRelayStarted();
