const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, net: electronNet, session } = require("electron");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

let mainWindow;
let tray;
const PROJECT_ENV_PATH = path.join(__dirname, "..", ".env");
const SETTINGS_KEYS = [
  "NETEASE_COOKIE",
  "AI_API_FORMAT",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_API_FORMAT",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_API_FORMAT",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_API_KEY",
  "MIMO_TTS_BASE_URL",
  "MIMO_TTS_MODEL",
  "MIMO_TTS_API_KEY",
  "MIMO_BASE_URL",
  "MIMO_MODEL",
  "MIMO_API_KEY"
];

function loadEnvFile(includeUserConfig = false) {
  const envPaths = [
    PROJECT_ENV_PATH,
    ...(includeUserConfig ? [getUserEnvPath()] : [])
  ];

  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) continue;

    const env = readEnvFile(envPath);
    for (const [key, value] of Object.entries(env.values)) {
      if (key && !process.env[key]) process.env[key] = value;
    }
  }
}

function getUserEnvPath() {
  return path.join(app.getPath("userData"), ".env");
}

function parseEnvValue(value) {
  const trimmed = String(value || "").trim();
  const quote = trimmed[0];
  if ((quote === "\"" || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readEnvFile(envPath = getUserEnvPath()) {
  const lines = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf8").split(/\r?\n/)
    : [];
  const values = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    if (!key) continue;
    values[key] = parseEnvValue(trimmed.slice(index + 1));
  }

  return { lines, values };
}

function serializeEnvValue(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function writeEnvValues(updates, envPath = getUserEnvPath()) {
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  const { lines } = readEnvFile(envPath);
  const seen = new Set();
  const nextLines = lines.map((line) => {
    const trimmed = line.trim();
    const index = trimmed.indexOf("=");
    if (!trimmed || trimmed.startsWith("#") || index === -1) return line;

    const key = trimmed.slice(0, index).trim();
    if (!Object.prototype.hasOwnProperty.call(updates, key)) return line;
    seen.add(key);
    return `${key}=${serializeEnvValue(updates[key])}`;
  });

  for (const key of SETTINGS_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(updates, key) || seen.has(key)) continue;
    nextLines.push(`${key}=${serializeEnvValue(updates[key])}`);
  }

  fs.writeFileSync(ENV_PATH, `${nextLines.join("\n").replace(/\s+$/g, "")}\n`, "utf8");
}

function getAppInfo() {
  const aiConfig = getAiConfig();
  const voiceConfig = getDjVoiceConfig();
  return {
    name: "Cloudio Player",
    source: "netease-playlist",
    hasCookie: Boolean(process.env.NETEASE_COOKIE),
    hasAiConfig: Boolean(aiConfig.apiKey && aiConfig.baseUrl),
    aiModel: aiConfig.model,
    hasDjVoice: Boolean(voiceConfig.apiKey && voiceConfig.baseUrl),
    hasFishAudio: Boolean(voiceConfig.apiKey && voiceConfig.baseUrl)
  };
}

const FULL_SIZE = { width: 480, height: 800 };
const MINI_SIZE = { width: 430, height: 168 };
const APP_ICON_PATH = path.join(__dirname, "..", "assets", "app-icon.ico");
const HEART_MODE_TRACKS = 30;
const DJ_VOICE_SESSION_PARTITION = "dj-voice";
const DEFAULT_MIMO_TTS_VOICE_PROMPT = "年轻女性，二十多岁，声音柔和温暖，像深夜电台主播。语速舒缓，带着一丝微笑和亲切感，让人感到安心和放松。";
const DJ_SYSTEM_PROMPT = `
你是 Cloudio Radio 的资深电台主播 DJ。你的声音气质温暖、松弛、有画面感，像深夜节目里很懂音乐和听众心情的主持人。

你要用中文和用户对话，回复短而有味道，避免长篇说教。你可以介绍歌曲、承接心情、讲一点音乐故事，也可以根据用户的口味帮忙找歌、播放歌单或生成一个适合搜索的歌单方向。

你必须只输出 JSON，不要输出 Markdown，不要输出代码块。JSON 结构如下：
{
  "reply": "给用户看的 DJ 口吻回复",
  "spokenIntro": "未来用于语音播报的一句自然开场，可与 reply 相同或更口语",
  "action": {
    "type": "none | play_song | load_playlist | daily | generate_playlist",
    "input": "歌曲名/歌手/歌单 URL/歌单 ID/歌单搜索关键词",
    "autoplay": true
  }
}

动作规则：
- 用户想听某一首歌、某位歌手或某种单曲氛围时，用 play_song，input 写适合网易云搜索的关键词。
- 用户给出歌单链接或歌单 ID 时，用 load_playlist。
- 用户明确要每日推荐时，用 daily。
- 用户要求根据偏好自动生成歌单、找一组歌或找某种氛围歌单时，用 generate_playlist，input 写 2 到 6 个中文关键词。
- 只是聊天、介绍、分享心情时，用 none。

不要假装已经播放成功；你可以说“我来帮你找”。如果信息不足，先温柔追问。
`.trim();

const DJ_TRACK_STORY_REQUIREMENT = `
每一首歌开始播放时，你都要像电台 DJ 一样做一段短介绍。
介绍必须包含以下至少一种内容：歌曲背景、歌手或专辑相关故事、创作/发行语境、适合聆听的画面或心情。
自动介绍新歌时，action.type 必须是 "none"，不要切歌、不要搜索、不要加载新歌单。
回复控制在 2 到 4 句中文，温暖、有画面感，不要编造具体事实；如果不确定事实，就分享听感和氛围。
`.trim();

const RADIO_DJ_SYSTEM_PROMPT = `
你是 Cloudio Radio 的电台 DJ，接入的是 DeepSeek API。你的主持风格像一档有温度的音乐电台：会听人说话，会接住情绪，会把歌曲、时间、上一首和下一首之间的气口串起来。

你必须使用中文，只输出 JSON，不输出 Markdown 或代码块。JSON 结构固定如下：
{
  "reply": "给用户看的 DJ 回复",
  "spokenIntro": "用于语音播报的自然口播，可以比 reply 更像电台串词",
  "action": {
    "type": "none | play_song | load_playlist | daily | generate_playlist",
    "input": "歌曲名/歌手/歌单 URL/歌单 ID/歌单搜索关键词",
    "autoplay": true
  }
}

主持规则：
- 读取系统提供的北京时间和播放上下文。不要每次都说“晚上好”；按实际时段自然开场，也可以不问候，直接进入串词。
- 介绍歌曲时像电台主播，不像百科词条。优先讲“这首歌为什么适合现在听”、它和上一首的情绪过渡、听众此刻可能的心境。
- 如果有上一首歌，必须加一句自然过渡：从节奏、年代、唱法、故事、情绪或画面感上承接到当前歌。
- 可以分享经典老歌的时代背景、发行语境、歌手轶事和那个年代的趣味细节；但不确定的事实不要编造，可以说“有一种说法”“更可靠的资料里没有太多细节”，然后转为听感和氛围。
- 多一点情绪互动：偶尔像对一个仍在收听的人说话，给一点陪伴、松弛、鼓励或轻轻的共鸣。
- 自动介绍正在播放的歌时，action.type 必须是 "none"，不要切歌、不要搜索、不要加载歌单。
- 口播控制在 2 到 5 句，留白一点，不要长篇说教。

动作规则：
- 用户想听某首歌、某位歌手或某种单曲氛围时，用 play_song，input 写适合网易云搜索的关键词。
- 用户给出歌单链接或歌单 ID 时，用 load_playlist。
- 用户明确要每日推荐时，用 daily。
- 用户要求根据偏好自动生成歌单、找一组歌或找某种氛围歌单时，用 generate_playlist，input 写 2 到 6 个中文关键词。
- 只是聊天、介绍、分享心情时，用 none。

不要假装已经播放成功；可以说“我来帮你找”。信息不足时先温柔追问。
`.trim();

const RADIO_DJ_TRACK_REQUIREMENT = `
每首歌开始播放时，你要做一段真实电台风格的短串词。
串词至少包含以下两类内容：
1. 当前时间、场景、听众情绪中的一种。
2. 歌曲背景、歌手故事、年代趣事、上一首到这一首的过渡、听感画面中的一种。

如果是经典老歌，可以讲一点年代质感和流行文化气息；如果不确定具体事实，就不要编造具体年份、奖项、事件，改为讲“那个时代的听感”“旋律带来的记忆感”。
`.trim();

const RADIO_DJ_TIME_RULE = `
时间只在以下情况自然提及：
1. 开场第一首。
2. 从早上到上午、上午到中午、中午到下午、下午到晚上、晚上到深夜这类明显时段变化。
3. 需要顺手营造现场感的时候。
如果没有明显需要，不要每首歌都重复时间。
`.trim();

const RADIO_DJ_ACTION_RULE = `
点歌动作选择规则：
- 只有用户明确给出歌名、歌手名，或说“播放某首歌/某个歌手”时，才使用 play_song。
- 用户说“来点/放点/适合开车/开车听/工作/睡前/激情/放松/公路/醒脑/氛围/某种心情”这类场景或氛围需求时，优先使用 generate_playlist，不要用 play_song。
- generate_playlist 的 input 写 2 到 6 个适合网易云歌单搜索的中文关键词，例如“开车 激情 公路 摇滚 电子”。
- 当你已经找到了可播放的歌曲或歌单时，直接自动播放最匹配的结果，不要再让用户从候选项里选择。
`.trim();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: FULL_SIZE.width,
    height: FULL_SIZE.height,
    minWidth: 320,
    minHeight: 120,
    backgroundColor: "#00000000",
    transparent: true,
    hasShadow: false,
    title: "Cloudio Player",
    icon: APP_ICON_PATH,
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

function createTray() {
  if (tray || !fs.existsSync(APP_ICON_PATH)) return;

  tray = new Tray(APP_ICON_PATH);
  tray.setToolTip("Cloudio Radio");
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: "Open Cloudio Radio",
      click: () => {
        if (!mainWindow) createWindow();
        mainWindow.show();
        mainWindow.focus();
      }
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit()
    }
  ]));
  tray.on("click", () => {
    if (!mainWindow) createWindow();
    mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show();
  });
}

function setViewMode(mode) {
  if (!mainWindow) return;
  const target = mode === "mini" ? MINI_SIZE : FULL_SIZE;
  const bounds = mainWindow.getBounds();

  if (mode === "mini") {
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(target.width, target.height);
    mainWindow.setMaximumSize(target.width, target.height);
    mainWindow.setResizable(false);
    mainWindow.setAlwaysOnTop(true);
  } else {
    mainWindow.setResizable(true);
    mainWindow.setMaximumSize(10000, 10000);
    mainWindow.setMinimumSize(320, 120);
    mainWindow.setResizable(true);
    mainWindow.setAlwaysOnTop(false);
  }

  mainWindow.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: target.width,
    height: target.height
  }, true);
  mainWindow.setContentSize(target.width, target.height, true);
}

function registerShortcuts() {
  globalShortcut.register("Space", () => {
    mainWindow?.webContents.send("player:shortcut", "toggle");
  });
  globalShortcut.register("CommandOrControl+Right", () => {
    mainWindow?.webContents.send("player:shortcut", "next");
  });
  globalShortcut.register("CommandOrControl+Left", () => {
    mainWindow?.webContents.send("player:shortcut", "prev");
  });
}

function neteaseHeaders() {
  const cookie = process.env.NETEASE_COOKIE || "";
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    "Referer": "https://music.163.com/",
    "Accept": "application/json, text/plain, */*",
    ...(cookie ? { Cookie: cookie } : {})
  };
}

async function configurePlayerSession() {
  const proxyRules = proxyUrlToRules(process.env.NETEASE_PROXY || process.env.PLAYER_PROXY || "");

  await session.defaultSession.setProxy(
    proxyRules
      ? { mode: "fixed_servers", proxyRules, proxyBypassRules: "<local>" }
      : { mode: "direct" }
  );

  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ["*://*.music.126.net/*", "*://music.163.com/*", "*://*.music.163.com/*"] },
    (details, callback) => {
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          "User-Agent": neteaseHeaders()["User-Agent"],
          "Referer": "https://music.163.com/"
        }
      });
    }
  );
}

function parsePlaylistId(input) {
  const text = String(input || "").trim();
  if (/^\d+$/.test(text)) return text;

  const idMatch = text.match(/[?&]id=(\d+)/);
  if (idMatch) return idMatch[1];

  const pathMatch = text.match(/playlist\/(\d+)/);
  if (pathMatch) return pathMatch[1];

  return "";
}

function pickPalette(index, imageUrl) {
  const palettes = [
    ["#0d3f69", "#f0b65a"],
    ["#362319", "#ffd67c"],
    ["#13203e", "#f25f4c"],
    ["#1c2f20", "#c8f26b"],
    ["#2e2039", "#f7c7ef"],
    ["#12333a", "#65d6d1"]
  ];

  if (imageUrl) {
    const hash = [...imageUrl].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return palettes[hash % palettes.length];
  }

  return palettes[index % palettes.length];
}

function normalizeTrack(track, index) {
  const album = track.al || track.album || {};
  const artists = track.ar || track.artists || [];
  const [colorA, colorB] = pickPalette(index, album.picUrl);
  const artistText = artists.map((artist) => artist.name).filter(Boolean).join(" / ") || "Unknown Artist";

  return {
    id: track.id,
    title: track.name || "Untitled",
    artist: artistText,
    duration: Math.max(1, Math.round((track.dt || track.duration || 0) / 1000)),
    coverUrl: album.picUrl || "",
    album: album.name || "",
    fee: track.fee,
    colorA,
    colorB,
    cover: String(track.name || "MUSIC").slice(0, 4).toUpperCase(),
    lyric: `${artistText} - ${track.name || "Untitled"}`
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: neteaseHeaders()
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

async function postFormJson(url, form) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...neteaseHeaders(),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(form)
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

function aesEncrypt(text, key, iv = "0102030405060708") {
  const cipher = crypto.createCipheriv("aes-128-cbc", Buffer.from(key), Buffer.from(iv));
  return Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]).toString("base64");
}

function rsaEncrypt(text) {
  const reversed = String(text).split("").reverse().join("");
  const value = BigInt(`0x${Buffer.from(reversed).toString("hex")}`);
  const exponent = BigInt("0x010001");
  const modulus = BigInt(
    "0x00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7"
  );
  let result = 1n;
  let base = value % modulus;
  let power = exponent;

  while (power > 0n) {
    if (power % 2n === 1n) result = (result * base) % modulus;
    base = (base * base) % modulus;
    power /= 2n;
  }

  return result.toString(16).padStart(256, "0");
}

function weapiPayload(data) {
  const secretKey = "0CoJUm6Qyw8W8jud";
  const randomKey = crypto.randomBytes(8).toString("hex");
  const firstPass = aesEncrypt(JSON.stringify(data), secretKey);
  return {
    params: aesEncrypt(firstPass, randomKey),
    encSecKey: rsaEncrypt(randomKey)
  };
}

function getAiConfig() {
  const baseUrl = process.env.OPENAI_BASE_URL || process.env.DEEPSEEK_BASE_URL || process.env.ANTHROPIC_BASE_URL || "";
  const requestedFormat = (
    process.env.AI_API_FORMAT ||
    process.env.DEEPSEEK_API_FORMAT ||
    process.env.OPENAI_API_FORMAT ||
    ""
  ).toLowerCase();
  const inferredFormat = /\/anthropic(?:\/|$)/i.test(baseUrl) ? "anthropic" : "openai";

  return {
    apiKey:
      process.env.OPENAI_API_KEY ||
      process.env.DEEPSEEK_API_KEY ||
      process.env.ANTHROPIC_AUTH_TOKEN ||
      process.env.ANTHROPIC_API_KEY ||
      "",
    baseUrl,
    model: process.env.OPENAI_MODEL || process.env.DEEPSEEK_MODEL || process.env.ANTHROPIC_MODEL || "deepseek-v4-pro[1m]",
    format: requestedFormat || inferredFormat
  };
}

function getDjVoiceConfig() {
  return {
    apiKey: process.env.MIMO_TTS_API_KEY || process.env.MIMO_API_KEY || "",
    model: process.env.MIMO_TTS_MODEL || "mimo-v2.5-tts-voicedesign",
    baseUrl: (process.env.MIMO_TTS_BASE_URL || process.env.MIMO_BASE_URL || "https://token-plan-cn.xiaomimimo.com/v1").replace(/\/+$/, ""),
    voicePrompt: process.env.MIMO_TTS_VOICE_PROMPT || DEFAULT_MIMO_TTS_VOICE_PROMPT,
    format: process.env.MIMO_TTS_FORMAT || "wav",
    optimizeTextPreview: process.env.MIMO_TTS_OPTIMIZE_TEXT_PREVIEW !== "false",
    proxy:
      process.env.MIMO_TTS_PROXY ||
      process.env.HTTPS_PROXY ||
      process.env.HTTP_PROXY ||
      process.env.ALL_PROXY ||
      ""
  };
}

function getRuntimeSettings() {
  return {
    neteaseCookie: process.env.NETEASE_COOKIE || "",
    openaiBaseUrl: process.env.OPENAI_BASE_URL || process.env.DEEPSEEK_BASE_URL || "",
    openaiModel: process.env.OPENAI_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-v4-pro[1m]",
    openaiApiKey: process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || "",
    mimoBaseUrl: process.env.MIMO_TTS_BASE_URL || process.env.MIMO_BASE_URL || "https://token-plan-cn.xiaomimimo.com/v1",
    mimoModel: process.env.MIMO_TTS_MODEL || process.env.MIMO_MODEL || "mimo-v2.5-tts-voicedesign",
    mimoApiKey: process.env.MIMO_TTS_API_KEY || process.env.MIMO_API_KEY || ""
  };
}

async function saveRuntimeSettings(input) {
  const settings = {
    neteaseCookie: String(input?.neteaseCookie || "").trim(),
    openaiBaseUrl: String(input?.openaiBaseUrl || "").trim().replace(/\/+$/, ""),
    openaiModel: String(input?.openaiModel || "").trim(),
    openaiApiKey: String(input?.openaiApiKey || "").trim(),
    mimoBaseUrl: String(input?.mimoBaseUrl || "").trim().replace(/\/+$/, ""),
    mimoModel: String(input?.mimoModel || "").trim(),
    mimoApiKey: String(input?.mimoApiKey || "").trim()
  };

  const updates = {
    NETEASE_COOKIE: settings.neteaseCookie,
    AI_API_FORMAT: "openai",
    OPENAI_BASE_URL: settings.openaiBaseUrl,
    OPENAI_MODEL: settings.openaiModel,
    OPENAI_API_KEY: settings.openaiApiKey,
    OPENAI_API_FORMAT: "openai",
    DEEPSEEK_BASE_URL: settings.openaiBaseUrl,
    DEEPSEEK_MODEL: settings.openaiModel,
    DEEPSEEK_API_KEY: settings.openaiApiKey,
    DEEPSEEK_API_FORMAT: "openai",
    ANTHROPIC_BASE_URL: "",
    ANTHROPIC_MODEL: "",
    ANTHROPIC_AUTH_TOKEN: "",
    ANTHROPIC_API_KEY: "",
    MIMO_TTS_BASE_URL: settings.mimoBaseUrl,
    MIMO_TTS_MODEL: settings.mimoModel,
    MIMO_TTS_API_KEY: settings.mimoApiKey,
    MIMO_BASE_URL: settings.mimoBaseUrl,
    MIMO_MODEL: settings.mimoModel,
    MIMO_API_KEY: settings.mimoApiKey
  };

  writeEnvValues(updates);
  Object.entries(updates).forEach(([key, value]) => {
    process.env[key] = value;
  });

  await configurePlayerSession();

  return {
    settings: getRuntimeSettings(),
    appInfo: getAppInfo()
  };
}

function chatCompletionsUrl(baseUrl) {
  const cleanBase = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!cleanBase) return "";
  if (/\/chat\/completions$/i.test(cleanBase)) return cleanBase;
  return `${cleanBase}/chat/completions`;
}

function anthropicMessagesUrl(baseUrl) {
  const cleanBase = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!cleanBase) return "";
  if (/\/v1\/messages$/i.test(cleanBase)) return cleanBase;
  return `${cleanBase}/v1/messages`;
}

function proxyUrlToRules(proxyUrl) {
  const text = String(proxyUrl || "").trim();
  if (!text) return "";

  try {
    const url = new URL(text);
    const host = `${url.hostname}${url.port ? `:${url.port}` : ""}`;
    if (url.protocol.startsWith("socks")) return `${url.protocol}//${host}`;
    return `http=${host};https=${host}`;
  } catch {
    return text;
  }
}

async function configureDjVoiceProxy(proxyUrl) {
  const proxyRules = proxyUrlToRules(proxyUrl);
  if (!proxyRules) return null;

  const voiceSession = session.fromPartition(DJ_VOICE_SESSION_PARTITION);
  await voiceSession.setProxy({
    mode: "fixed_servers",
    proxyRules,
    proxyBypassRules: "<local>"
  });
  return voiceSession;
}

function electronPostBinary(url, headers, body, requestSession = null) {
  return new Promise((resolve, reject) => {
    const request = electronNet.request({
      method: "POST",
      url,
      ...(requestSession ? { session: requestSession } : {})
    });
    const chunks = [];

    request.on("response", (response) => {
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const responseHeaders = Object.fromEntries(
          Object.entries(response.headers || {}).map(([key, value]) => [
            key.toLowerCase(),
            Array.isArray(value) ? value.join(", ") : String(value)
          ])
        );

        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          header: (name) => responseHeaders[String(name).toLowerCase()] || "",
          buffer,
          text: () => buffer.toString("utf8")
        });
      });
    });

    request.on("error", reject);
    Object.entries(headers).forEach(([key, value]) => request.setHeader(key, value));
    request.write(body);
    request.end();
  });
}

async function synthesizeDjVoice(text) {
  const config = getDjVoiceConfig();
  const spokenText = String(text || "").trim().slice(0, 700);

  if (!spokenText) throw new Error("No DJ voice text.");
  if (!config.apiKey || !config.baseUrl) {
    throw new Error("Set MIMO_TTS_API_KEY and MIMO_TTS_BASE_URL in .env before using DJ voice.");
  }

  let response;
  try {
    const requestSession = await configureDjVoiceProxy(config.proxy);
    response = await electronPostBinary(
      chatCompletionsUrl(config.baseUrl),
      {
        "api-key": config.apiKey,
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "user",
            content: config.voicePrompt
          },
          {
            role: "assistant",
            content: spokenText
          }
        ],
        audio: {
          format: config.format,
          optimize_text_preview: config.optimizeTextPreview
        },
        temperature: Number(process.env.MIMO_TTS_TEMPERATURE || 0.6),
        top_p: Number(process.env.MIMO_TTS_TOP_P || 0.95)
      }),
      requestSession
    );
  } catch (error) {
    const reason = error.message || "network error";
    throw new Error(`MiMo TTS network failed: ${reason}`);
  }

  if (!response.ok) {
    const detail = response.text();
    throw new Error(`MiMo TTS request failed: ${response.status}${detail ? ` ${detail.slice(0, 160)}` : ""}`);
  }

  let data;
  try {
    data = JSON.parse(response.text());
  } catch {
    throw new Error("MiMo TTS returned an invalid JSON response.");
  }

  const audioData = data?.choices?.[0]?.message?.audio?.data || "";
  if (!audioData) {
    throw new Error("MiMo TTS response did not include audio data.");
  }

  const mimeType = config.format === "mp3" ? "audio/mpeg" : `audio/${config.format}`;

  return {
    mimeType,
    audioUrl: `data:${mimeType};base64,${audioData}`
  };
}

function safeDjAction(action) {
  const allowed = new Set(["none", "play_song", "load_playlist", "daily", "generate_playlist"]);
  const type = allowed.has(action?.type) ? action.type : "none";
  return {
    type,
    input: String(action?.input || "").slice(0, 300),
    autoplay: action?.autoplay !== false
  };
}

function parseDjJson(content) {
  const text = String(content || "").trim();
  if (!text) {
    return {
      reply: "我这边刚刚有点走神。你再说一次想听什么，我马上把频道调准。",
      spokenIntro: "",
      action: safeDjAction()
    };
  }

  try {
    const parsed = JSON.parse(text);
    return {
      reply: String(parsed.reply || text),
      spokenIntro: String(parsed.spokenIntro || parsed.reply || ""),
      action: safeDjAction(parsed.action)
    };
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return {
          reply: String(parsed.reply || text),
          spokenIntro: String(parsed.spokenIntro || parsed.reply || ""),
          action: safeDjAction(parsed.action)
        };
      } catch {
        // Fall back to plain text below.
      }
    }
  }

  return {
    reply: text,
    spokenIntro: text,
    action: safeDjAction()
  };
}

function buildPlayerContext(context) {
  const track = context?.currentTrack || {};
  return [
    `当前播放状态：${context?.playing ? "正在播放" : "未播放"}`,
    `当前歌单：${context?.playlistName || "未知"}，共 ${context?.trackCount || 0} 首`,
    `当前歌曲：${track.title || "无"} - ${track.artist || "未知歌手"}`,
    `当前专辑：${track.album || "未知"}`
  ].join("\n");
}

function buildBeijingTimeContext(now = new Date()) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  const hour = Number(part("hour"));
  const period = hour < 5 ? "凌晨" : hour < 11 ? "早晨" : hour < 14 ? "午后" : hour < 18 ? "下午" : hour < 23 ? "夜晚" : "深夜";
  return `${part("year")}年${part("month")}月${part("day")}日 ${part("weekday")} ${part("hour")}:${part("minute")}，${period}`;
}

function formatTrackForContext(track) {
  if (!track?.title && !track?.artist) return "无";
  return `${track.title || "未知歌曲"} - ${track.artist || "未知歌手"}，专辑：${track.album || "未知"}`;
}

function buildRadioPlayerContext(context) {
  return [
    `北京时间：${buildBeijingTimeContext()}`,
    `播放状态：${context?.playing ? "正在播放" : "未播放"}`,
    `当前歌单：${context?.playlistName || "未知"}，共 ${context?.trackCount || 0} 首`,
    `上一首：${formatTrackForContext(context?.previousTrack)}`,
    `当前歌曲：${formatTrackForContext(context?.currentTrack)}`
  ].join("\n");
}

async function fetchDjReply(payload) {
  const config = getAiConfig();
  const url = config.format === "anthropic"
    ? anthropicMessagesUrl(config.baseUrl)
    : chatCompletionsUrl(config.baseUrl);

  if (!config.apiKey || !url) {
    throw new Error("Set AI api key and base url in .env before using the DJ.");
  }

  const history = Array.isArray(payload?.messages) ? payload.messages : [];
  const system = [
    RADIO_DJ_SYSTEM_PROMPT,
    RADIO_DJ_TRACK_REQUIREMENT,
    RADIO_DJ_TIME_RULE,
    RADIO_DJ_ACTION_RULE,
    buildRadioPlayerContext(payload?.player)
  ].join("\n\n");
  const messages = history.slice(-12).map((message) => ({
    role: message.role === "assistant" ? "assistant" : "user",
    content: String(message.content || "").slice(0, 1200)
  }));

  if (config.format === "anthropic") {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "Authorization": `Bearer ${config.apiKey}`,
        "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        system,
        messages,
        max_tokens: Number(process.env.AI_MAX_TOKENS || 900),
        temperature: 0.85
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`DJ request failed: ${response.status}${detail ? ` ${detail.slice(0, 160)}` : ""}`);
    }

    const data = await response.json();
    const content = (data?.content || [])
      .filter((part) => part?.type === "text")
      .map((part) => part.text)
      .join("\n");
    return parseDjJson(content);
  }

  const openAiMessages = [
    { role: "system", content: RADIO_DJ_SYSTEM_PROMPT },
    { role: "system", content: RADIO_DJ_TRACK_REQUIREMENT },
    { role: "system", content: RADIO_DJ_TIME_RULE },
    { role: "system", content: RADIO_DJ_ACTION_RULE },
    { role: "system", content: buildRadioPlayerContext(payload?.player) },
    ...messages
  ];

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      messages: openAiMessages,
      temperature: 0.85
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`DJ request failed: ${response.status}${detail ? ` ${detail.slice(0, 160)}` : ""}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  return parseDjJson(content);
}

async function searchNetease(input, type, limit = 10) {
  const query = String(input || "").trim();
  if (!query) throw new Error("Search query is required.");

  const url =
    `https://music.163.com/api/search/get/web?s=${encodeURIComponent(query)}` +
    `&type=${encodeURIComponent(type)}&limit=${encodeURIComponent(limit)}&offset=0`;
  return fetchJson(url);
}

async function searchSongs(input, limit = 10) {
  const data = await searchNetease(input, 1, limit);
  return (data?.result?.songs || []).map(normalizeTrack).filter((track) => track.id);
}

async function searchPlaylists(input, limit = 8) {
  const data = await searchNetease(input, 1000, limit);
  return (data?.result?.playlists || []).map((playlist) => ({
    id: playlist.id,
    name: playlist.name || `Playlist ${playlist.id}`,
    trackCount: playlist.trackCount || 0,
    coverUrl: playlist.coverImgUrl || "",
    creator: playlist.creator?.nickname || "",
    playCount: playlist.playCount || 0
  })).filter((playlist) => playlist.id);
}

async function fetchSongDetails(ids) {
  const uniqueIds = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  const tracks = [];

  for (let index = 0; index < uniqueIds.length; index += 300) {
    const chunk = uniqueIds.slice(index, index + 300);
    const c = encodeURIComponent(JSON.stringify(chunk.map((id) => ({ id }))));
    const data = await fetchJson(`https://music.163.com/api/v3/song/detail?c=${c}`);
    tracks.push(...(data?.songs || []));
  }

  return tracks;
}

async function fetchPlaylist(input) {
  const id = parsePlaylistId(input);
  if (!id) throw new Error("Invalid playlist id or URL.");

  const url = `https://music.163.com/api/v6/playlist/detail?id=${encodeURIComponent(id)}&n=100000`;
  const data = await fetchJson(url);
  const playlist = data.playlist;
  if (!playlist) throw new Error("Playlist not found.");

  const trackIds = (playlist.trackIds || []).map((item) => item.id).filter(Boolean);
  const rawTracks = playlist.tracks?.length >= trackIds.length || !trackIds.length
    ? playlist.tracks || []
    : await fetchSongDetails(trackIds);
  const tracks = rawTracks.map(normalizeTrack).filter((track) => track.id);

  return {
    id,
    name: playlist.name || `Playlist ${id}`,
    coverUrl: playlist.coverImgUrl || "",
    trackCount: trackIds.length || tracks.length,
    tracks
  };
}

async function fetchDailyRecommendations() {
  if (!process.env.NETEASE_COOKIE) {
    throw new Error("NETEASE_COOKIE is required for daily recommendations.");
  }

  const data = await fetchJson("https://music.163.com/api/v3/discovery/recommend/songs");
  const dailySongs = data?.data?.dailySongs || data?.recommend || [];
  if (!dailySongs.length) {
    throw new Error(data?.message || "No daily recommendations returned.");
  }

  const tracks = dailySongs.map(normalizeTrack).filter((track) => track.id);

  return {
    id: "daily",
    name: "Daily Recommendations",
    coverUrl: tracks[0]?.coverUrl || "",
    trackCount: tracks.length,
    tracks
  };
}

async function fetchUserLibrary() {
  const account = await fetchJson("https://music.163.com/api/nuser/account/get");
  const uid = account?.profile?.userId || account?.account?.id || "";
  if (!uid) throw new Error("Unable to resolve NetEase user id.");

  const data = await fetchJson(
    `https://music.163.com/api/user/playlist?uid=${encodeURIComponent(uid)}&limit=1000&offset=0`
  );
  const playlists = (data?.playlist || []).map((playlist) => ({
    id: playlist.id,
    name: playlist.name || `Playlist ${playlist.id}`,
    trackCount: playlist.trackCount || 0,
    coverUrl: playlist.coverImgUrl || "",
    creator: playlist.creator?.nickname || "",
    creatorId: playlist.creator?.userId || 0,
    playCount: playlist.playCount || 0,
    subscribed: Boolean(playlist.subscribed),
    specialType: playlist.specialType || 0
  })).filter((playlist) => playlist.id);

  const likedPlaylist = playlists.find((playlist) => playlist.specialType === 5) || null;
  return {
    uid,
    likedPlaylist,
    playlists
  };
}

async function fetchHeartMode() {
  const library = await fetchUserLibrary();
  const liked = library.likedPlaylist;
  if (!liked?.id) throw new Error("Liked playlist not found.");

  const fallback = await fetchPlaylist(String(liked.id));
  const seed = fallback.tracks[0];
  if (!seed?.id) return { ...fallback, id: "heart-mode", name: "Heart Mode" };

  try {
    const data = await postFormJson(
      "https://music.163.com/weapi/playmode/intelligence/list",
      weapiPayload({
        songId: String(seed.id),
        type: "fromPlayOne",
        playlistId: String(liked.id),
        startMusicId: String(seed.id),
        count: HEART_MODE_TRACKS
      })
    );
    const songs = (data?.data || []).map((item) => item.songInfo || item.song).filter(Boolean);
    const tracks = songs.slice(0, HEART_MODE_TRACKS).map(normalizeTrack).filter((track) => track.id);
    if (tracks.length) {
      return {
        id: "heart-mode",
        name: "Heart Mode",
        coverUrl: tracks[0]?.coverUrl || fallback.coverUrl || "",
        trackCount: tracks.length,
        tracks
      };
    }
  } catch (error) {
    console.warn(`Heart mode fallback used: ${error.message}`);
  }

  return { ...fallback, id: "heart-mode", name: "Heart Mode" };
}

async function fetchSongUrl(songId) {
  const id = String(songId || "").trim();
  if (!/^\d+$/.test(id)) throw new Error("Invalid song id.");

  const preferredLevel = process.env.NETEASE_LEVEL || "exhigh";
  const levels = [preferredLevel, "lossless", "higher", "standard"];

  for (const level of [...new Set(levels)]) {
    const url =
      `https://music.163.com/api/song/enhance/player/url/v1?ids=[${encodeURIComponent(id)}]` +
      `&level=${encodeURIComponent(level)}&encodeType=mp3`;
    const data = await fetchJson(url);
    const item = data?.data?.[0];
    if (item?.url) {
      return {
        url: item.url,
        level: item.level || level,
        type: item.type || "mp3",
        freeTrialInfo: item.freeTrialInfo || null
      };
    }
  }

  return {
    url: `https://music.163.com/song/media/outer/url?id=${encodeURIComponent(id)}.mp3`,
    level: "outer",
    type: "mp3",
    freeTrialInfo: null
  };
}

loadEnvFile();
app.setAppUserModelId("com.cloudio.radio");

app.whenReady().then(async () => {
  loadEnvFile(true);
  await configurePlayerSession();
  createWindow();
  createTray();
  registerShortcuts();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("app:ready", () => getAppInfo());

ipcMain.handle("netease:playlist", async (_event, input) => fetchPlaylist(input));
ipcMain.handle("netease:daily", async () => fetchDailyRecommendations());
ipcMain.handle("netease:heart-mode", async () => fetchHeartMode());
ipcMain.handle("netease:user-library", async () => fetchUserLibrary());
ipcMain.handle("netease:song-url", async (_event, songId) => fetchSongUrl(songId));
ipcMain.handle("netease:search-songs", async (_event, input, limit) => searchSongs(input, limit));
ipcMain.handle("netease:search-playlists", async (_event, input, limit) => searchPlaylists(input, limit));
ipcMain.handle("ai:dj-chat", async (_event, payload) => fetchDjReply(payload));
ipcMain.handle("voice:tts", async (_event, text) => synthesizeDjVoice(text));
ipcMain.handle("fish:tts", async (_event, text) => synthesizeDjVoice(text));
ipcMain.handle("settings:get", () => getRuntimeSettings());
ipcMain.handle("settings:save", async (_event, input) => saveRuntimeSettings(input));
ipcMain.handle("window:set-view-mode", (_event, mode) => setViewMode(mode));
ipcMain.handle("window:minimize", () => mainWindow?.minimize());
ipcMain.handle("window:close", () => mainWindow?.close());
