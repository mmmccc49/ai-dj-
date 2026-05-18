const demoTracks = [
  {
    id: "",
    title: "Cloudio Player",
    artist: "Press DAILY to load music",
    duration: 0,
    cover: "PLAY",
    coverUrl: "",
    lyric: "Daily recommendations need NETEASE_COOKIE in .env."
  }
];

const state = {
  tracks: demoTracks,
  index: 0,
  playing: false,
  loadingUrl: false,
  appInfo: null,
  miniMode: false,
  djMessages: [],
  djBusy: false,
  djIntroBusy: false,
  lastIntroducedTrackId: "",
  djAudio: null,
  previousTrack: null,
  volumeFade: null,
  baseMusicVolume: 0.5,
  ducking: false,
  preparedIntro: null,
  preparingIntroTrackId: "",
  lastIntroPeriod: "",
  userLibrary: null,
  userLibraryPromise: null,
  loadingLibrary: false
};

const MUSIC_FADE_SECONDS = 10;
const DJ_DUCK_VOLUME = 0.28;
const DJ_VOICE_VOLUME = 1;
const DJ_VOICE_GAIN = 1.22;
const INTRO_PREPARE_SECONDS = 55;
const MAX_ACTION_TRACKS = 30;

const player = document.querySelector("#player");
const audio = document.querySelector("#audio");
const playlist = document.querySelector("#playlist");
const playlistForm = document.querySelector("#playlistForm");
const playlistInput = document.querySelector("#playlistInput");
const dailyBtn = document.querySelector("#dailyBtn");
const dailyFormBtn = document.querySelector("#dailyFormBtn");
const shuffleBtn = document.querySelector("#shuffleBtn");
const settingsBtn = document.querySelector("#settingsBtn");
const settingsModal = document.querySelector("#settingsModal");
const settingsCloseBtn = document.querySelector("#settingsCloseBtn");
const settingsForm = document.querySelector("#settingsForm");
const settingsSaveBtn = document.querySelector("#settingsSaveBtn");
const settingsHint = document.querySelector("#settingsHint");
const neteaseCookieInput = document.querySelector("#neteaseCookieInput");
const openaiBaseUrlInput = document.querySelector("#openaiBaseUrlInput");
const openaiModelInput = document.querySelector("#openaiModelInput");
const openaiApiKeyInput = document.querySelector("#openaiApiKeyInput");
const mimoBaseUrlInput = document.querySelector("#mimoBaseUrlInput");
const mimoModelInput = document.querySelector("#mimoModelInput");
const mimoApiKeyInput = document.querySelector("#mimoApiKeyInput");
const heartBtn = document.querySelector("#heartBtn");
const favoritesMenuBtn = document.querySelector("#favoritesMenuBtn");
const favoritesMenu = document.querySelector("#favoritesMenu");
const favoritesMenuList = document.querySelector("#favoritesMenuList");
const playlistName = document.querySelector("#playlistName");
const trackTitle = document.querySelector("#trackTitle");
const trackArtist = document.querySelector("#trackArtist");
const miniClock = document.querySelector("#miniClock");
const playBtn = document.querySelector("#playBtn");
const progress = document.querySelector("#progress");
const elapsed = document.querySelector("#elapsed");
const duration = document.querySelector("#duration");
const coverImage = document.querySelector("#coverImage");
const coverFallback = document.querySelector("#coverFallback");
const coverTitle = document.querySelector("#coverTitle");
const statusLabel = document.querySelector("#statusLabel");
const trackCount = document.querySelector("#trackCount");
const toggleViewBtn = document.querySelector("#toggleViewBtn");
const prevBtn = document.querySelector("#prevBtn");
const nextBtn = document.querySelector("#nextBtn");
const minimizeBtn = document.querySelector("#minimizeBtn");
const closeBtn = document.querySelector("#closeBtn");
const playlistTabBtn = document.querySelector("#playlistTabBtn");
const sideTabBtn = document.querySelector("#sideTabBtn");
const playlistPane = document.querySelector("#playlistPane");
const sidePane = document.querySelector("#sidePane");
const djMessages = document.querySelector("#djMessages");
const djForm = document.querySelector("#djForm");
const djInput = document.querySelector("#djInput");
const djSendBtn = document.querySelector("#djSendBtn");
const djPromptBtns = document.querySelectorAll(".dj-prompt[data-prompt]");

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function formatBeijingTime() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const hour = parts.find((part) => part.type === "hour")?.value || "00";
  const minute = parts.find((part) => part.type === "minute")?.value || "00";
  return `${hour}:${minute}`;
}

function formatBeijingDate() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
    month: "short",
    day: "2-digit"
  }).format(new Date()).toUpperCase().replace(",", "");
}

function formatBeijingRadioTime() {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  const hour = Number(part("hour"));
  const period = hour < 5 ? "凌晨" : hour < 11 ? "早晨" : hour < 14 ? "午后" : hour < 18 ? "下午" : hour < 23 ? "夜晚" : "深夜";
  return `${part("weekday")} ${part("hour")}:${part("minute")}，${period}`;
}

function describeTrackForDj(track) {
  if (!track?.title && !track?.artist) return "无";
  return `${track.title || "未知歌曲"} - ${track.artist || "未知歌手"}，专辑：${track.album || "未知"}`;
}

function getRadioDayPeriod(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    hour12: false
  }).format(date));
  if (hour < 5) return "凌晨";
  if (hour < 9) return "早上";
  if (hour < 12) return "上午";
  if (hour < 14) return "中午";
  if (hour < 18) return "下午";
  if (hour < 22) return "晚上";
  return "深夜";
}

function shouldMentionTimeForIntro() {
  const period = getRadioDayPeriod();
  return !state.lastIntroPeriod || state.lastIntroPeriod !== period;
}

function markIntroTimePeriod() {
  state.lastIntroPeriod = getRadioDayPeriod();
}

function updateBeijingClock() {
  miniClock.textContent = formatBeijingTime();
  miniClock.dataset.date = formatBeijingDate();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

function hexToRgb(hex) {
  const normalized = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return { r: 18, g: 20, b: 28 };
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}

function rgbToCss({ r, g, b }, alpha = 1) {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function mixRgb(color, target, amount) {
  return {
    r: clampChannel(color.r + (target.r - color.r) * amount),
    g: clampChannel(color.g + (target.g - color.g) * amount),
    b: clampChannel(color.b + (target.b - color.b) * amount)
  };
}

function colorScore({ r, g, b }) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max - min;
  const brightness = (r + g + b) / 3;
  return saturation * 1.25 + brightness * 0.35;
}

function applyThemeFromColor(color) {
  const dark = mixRgb(color, { r: 5, g: 6, b: 10 }, 0.68);
  const deep = mixRgb(color, { r: 0, g: 0, b: 0 }, 0.48);
  const surface = mixRgb(color, { r: 20, g: 20, b: 28 }, 0.62);
  const accent = mixRgb(color, { r: 255, g: 220, b: 150 }, 0.24);
  const bright = mixRgb(color, { r: 255, g: 245, b: 210 }, 0.42);

  player.style.setProperty("--theme-bg", rgbToCss(dark));
  player.style.setProperty("--theme-bg-deep", rgbToCss(deep));
  player.style.setProperty("--theme-surface", rgbToCss(surface, 0.72));
  player.style.setProperty("--theme-glow", rgbToCss(color, 0.38));
  player.style.setProperty("--theme-glow-soft", rgbToCss(color, 0.16));
  player.style.setProperty("--accent", rgbToCss(accent));
  player.style.setProperty("--accent-bright", rgbToCss(bright));
  player.style.setProperty("--accent-glow", rgbToCss(accent, 0.34));
  player.style.setProperty("--accent-dim", rgbToCss(accent, 0.14));
}

function sampleCoverTheme(image) {
  const canvas = document.createElement("canvas");
  const size = 48;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const buckets = new Map();

  for (let index = 0; index < data.length; index += 16) {
    const alpha = data[index + 3];
    if (alpha < 180) continue;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max < 28 || min > 235) continue;
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  const colors = [...buckets.values()].map((bucket) => ({
    r: bucket.r / bucket.count,
    g: bucket.g / bucket.count,
    b: bucket.b / bucket.count,
    count: bucket.count
  }));

  colors.sort((a, b) => (b.count * 12 + colorScore(b)) - (a.count * 12 + colorScore(a)));
  return colors[0] || null;
}

function applyTrackTheme(track) {
  applyThemeFromColor(hexToRgb(track.colorA || "#12333a"));
}

function sampleCoverUrlTheme(track) {
  if (!track?.coverUrl) return;

  const sampler = new Image();
  sampler.crossOrigin = "anonymous";
  sampler.onload = () => {
    if (state.tracks[state.index]?.coverUrl !== track.coverUrl) return;
    try {
      const sampled = sampleCoverTheme(sampler);
      if (sampled) applyThemeFromColor(sampled);
    } catch {
      applyTrackTheme(track);
    }
  };
  sampler.onerror = () => applyTrackTheme(track);
  sampler.src = track.coverUrl;
}

function renderPlaylist() {
  playlist.replaceChildren();
  trackCount.textContent = state.tracks.length;

  state.tracks.forEach((track, index) => {
    const button = document.createElement("button");
    button.className = `track ${index === state.index ? "active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <span class="mini-cover">
        ${track.coverUrl ? `<img src="${escapeHtml(track.coverUrl)}" alt="" />` : escapeHtml((track.cover || "♪").slice(0, 2))}
      </span>
      <span class="track-meta">
        <span class="track-name">${escapeHtml(track.title)}</span>
        <span class="track-sub">${escapeHtml(track.artist)}</span>
      </span>
      <span class="track-time">${formatTime(track.duration)}</span>
    `;
    button.addEventListener("click", () => selectTrack(index, true));
    playlist.append(button);
  });
}

function renderTrack() {
  const track = state.tracks[state.index] || demoTracks[0];
  trackTitle.textContent = track.title;
  trackArtist.textContent = track.artist;
  duration.textContent = formatTime(audio.duration || track.duration);
  coverTitle.textContent = (track.cover || "PLAY").slice(0, 4);

  if (track.coverUrl) {
    coverImage.dataset.coverUrl = track.coverUrl;
    coverImage.src = track.coverUrl;
    coverImage.style.display = "block";
    coverFallback.style.display = "none";
  } else {
    coverImage.removeAttribute("src");
    delete coverImage.dataset.coverUrl;
    coverImage.style.display = "none";
    coverFallback.style.display = "grid";
  }

  applyTrackTheme(track);
  sampleCoverUrlTheme(track);
  player.classList.toggle("is-playing", state.playing);
  renderPlaylist();
  updateProgress();
}

function updateProgress() {
  const current = audio.currentTime || 0;
  const total = audio.duration || state.tracks[state.index]?.duration || 0;
  const pct = total > 0 ? (current / total) * 100 : 0;
  progress.value = total > 0 ? Math.round((current / total) * 1000) : 0;
  progress.style.setProperty("--progress", `${pct}%`);
  elapsed.textContent = formatTime(current);
  duration.textContent = formatTime(total);

  if (total > INTRO_PREPARE_SECONDS && total - current <= INTRO_PREPARE_SECONDS) {
    prepareUpcomingTrackIntro();
  }
}

function setStatus(message) {
  statusLabel.textContent = message || (state.appInfo?.hasCookie ? "NETEASE MEMBER" : "NETEASE");
}

function setSettingsBusy(isBusy, message = "") {
  if (settingsSaveBtn) settingsSaveBtn.disabled = isBusy;
  settingsForm?.querySelectorAll("input, textarea, button").forEach((control) => {
    if (control !== settingsCloseBtn) control.disabled = isBusy;
  });
  if (settingsHint && message) settingsHint.textContent = message;
}

function fillSettingsForm(settings) {
  if (!settings) return;
  neteaseCookieInput.value = settings.neteaseCookie || "";
  openaiBaseUrlInput.value = settings.openaiBaseUrl || "";
  openaiModelInput.value = settings.openaiModel || "";
  openaiApiKeyInput.value = settings.openaiApiKey || "";
  mimoBaseUrlInput.value = settings.mimoBaseUrl || "";
  mimoModelInput.value = settings.mimoModel || "";
  mimoApiKeyInput.value = settings.mimoApiKey || "";
}

function readSettingsForm() {
  return {
    neteaseCookie: neteaseCookieInput.value,
    openaiBaseUrl: openaiBaseUrlInput.value,
    openaiModel: openaiModelInput.value,
    openaiApiKey: openaiApiKeyInput.value,
    mimoBaseUrl: mimoBaseUrlInput.value,
    mimoModel: mimoModelInput.value,
    mimoApiKey: mimoApiKeyInput.value
  };
}

async function openSettings() {
  if (!settingsModal) return;
  settingsModal.hidden = false;
  player.classList.add("settings-open");
  setSettingsBusy(true, "正在读取当前配置...");

  try {
    fillSettingsForm(await window.cloudio.getSettings());
    setSettingsBusy(false, "保存后立即生效，并写入本机用户配置。");
    openaiBaseUrlInput.focus();
  } catch (error) {
    setSettingsBusy(false, error.message || "读取配置失败");
  }
}

function closeSettings() {
  if (!settingsModal) return;
  settingsModal.hidden = true;
  player.classList.remove("settings-open");
}

async function saveSettings(event) {
  event.preventDefault();
  setSettingsBusy(true, "正在保存并更新后台配置...");
  setStatus("Updating API settings...");

  try {
    const result = await window.cloudio.saveSettings(readSettingsForm());
    state.appInfo = result.appInfo || await window.cloudio.ready();
    fillSettingsForm(result.settings);
    setSettingsBusy(false, "已保存，新的接口配置已经生效。");
    setStatus("Settings updated");
    closeSettings();
  } catch (error) {
    setSettingsBusy(false, error.message || "保存失败");
    setStatus(error.message || "Settings update failed");
  }
}

function buildBootDjGreeting() {
  const voiceReady = state.appInfo?.hasDjVoice || state.appInfo?.hasFishAudio;
  if (state.appInfo?.hasAiConfig) {
    return `这里是 Cloudio Radio，当前是${formatBeijingRadioTime()}。想听一首歌、一个歌单，或者只是把此刻的心情放进音乐里，都可以直接告诉我。${voiceReady ? "我的声音线路也已经接好。" : ""}`;
  }
  return `这里是 Cloudio Radio，当前是${formatBeijingRadioTime()}。等你把 OPENAI_API_KEY、OPENAI_BASE_URL 和 OPENAI_MODEL 写进 .env，我就能正式开麦。`;
}

function playbackErrorMessage(error) {
  const detail = audio.error?.message || error?.message || "";
  if (/proxy/i.test(detail)) return "Playback failed: proxy connection failed";
  if (/format|MEDIA_ELEMENT_ERROR/i.test(detail)) return "Playback failed: unsupported audio response";
  if (/network/i.test(detail)) return "Playback failed: network error";
  return detail ? `Playback failed: ${detail.slice(0, 72)}` : "Could not play this track";
}

function setTransportBusy(isBusy) {
  playBtn.disabled = isBusy;
  prevBtn.disabled = isBusy;
  nextBtn.disabled = isBusy;
}

function setMusicVolume(value) {
  audio.volume = Math.max(0, Math.min(1, value));
}

function effectiveMusicVolume() {
  return state.ducking ? Math.min(state.baseMusicVolume, DJ_DUCK_VOLUME) : state.baseMusicVolume;
}

function cancelVolumeFade() {
  if (state.volumeFade) {
    cancelAnimationFrame(state.volumeFade);
    state.volumeFade = null;
  }
}

function fadeMusicVolume(target, seconds = MUSIC_FADE_SECONDS) {
  cancelVolumeFade();
  const start = audio.volume;
  const end = Math.max(0, Math.min(1, target));
  const durationMs = Math.max(0.1, seconds) * 1000;
  const startedAt = performance.now();

  const step = (now) => {
    const progress = Math.min(1, (now - startedAt) / durationMs);
    const eased = 1 - Math.pow(1 - progress, 3);
    setMusicVolume(start + (end - start) * eased);
    if (progress < 1) {
      state.volumeFade = requestAnimationFrame(step);
    } else {
      state.volumeFade = null;
    }
  };

  state.volumeFade = requestAnimationFrame(step);
}

function appendDjMessage(role, text, options = {}) {
  if (!djMessages) return;
  const content = String(text || "").trim();
  if (!content) return;

  const message = document.createElement("div");
  message.className = `dj-message ${role}`;

  const label = document.createElement("span");
  label.className = "dj-message-label";
  label.textContent = role === "user" ? "YOU" : "DJ";

  const bubble = document.createElement("p");
  bubble.textContent = content;

  message.append(label, bubble);

  if (options.action?.type && options.action.type !== "none") {
    const action = document.createElement("span");
    action.className = "dj-action-chip";
    action.textContent = options.action.type.replace("_", " ");
    message.append(action);
  }

  djMessages.append(message);
  djMessages.scrollTop = djMessages.scrollHeight;

  if (options.store !== false && (role === "user" || role === "assistant")) {
    state.djMessages.push({ role, content });
    state.djMessages = state.djMessages.slice(-16);
  }
}

function appendDjChoices(kind, items, onPick) {
  if (!djMessages || !items.length) return;

  const message = document.createElement("div");
  message.className = "dj-message assistant";

  const label = document.createElement("span");
  label.className = "dj-message-label";
  label.textContent = "DJ";

  const list = document.createElement("div");
  list.className = "dj-choice-list";

  items.forEach((item, index) => {
    const button = document.createElement("button");
    button.className = "dj-choice";
    button.type = "button";

    const title = document.createElement("span");
    title.className = "dj-choice-title";
    title.textContent = `${index + 1}. ${item.title || item.name || "Untitled"}`;

    const meta = document.createElement("span");
    meta.className = "dj-choice-meta";
    meta.textContent = kind === "song"
      ? item.artist || "Unknown Artist"
      : `${item.creator || "歌单"}${item.trackCount ? ` · ${item.trackCount} tracks` : ""}`;

    button.append(title, meta);
    button.addEventListener("click", () => onPick(item));
    list.append(button);
  });

  message.append(label, list);
  djMessages.append(message);
  djMessages.scrollTop = djMessages.scrollHeight;
}

function setDjBusy(isBusy) {
  state.djBusy = isBusy;
  djInput.disabled = isBusy;
  djSendBtn.disabled = isBusy;
  djPromptBtns.forEach((button) => {
    button.disabled = isBusy;
  });
}

function getPlayerContext() {
  const track = state.tracks[state.index] || {};
  return {
    playing: state.playing,
    playlistName: playlistName.textContent,
    trackCount: state.tracks.length,
    previousTrack: {
      title: state.previousTrack?.title || "",
      artist: state.previousTrack?.artist || "",
      album: state.previousTrack?.album || "",
      duration: state.previousTrack?.duration || 0
    },
    currentTrack: {
      title: track.title || "",
      artist: track.artist || "",
      album: track.album || "",
      duration: track.duration || 0
    }
  };
}

function buildTrackIntroPrompt(track) {
  return [
    "新歌已经开始播放，请按 Cloudio Radio DJ 的风格介绍这首歌，或分享一个相关音乐故事。",
    "必须只输出 JSON，action.type 必须是 none，不要执行任何播放或搜索动作。",
    `歌曲：${track.title || "未知歌曲"}`,
    `歌手：${track.artist || "未知歌手"}`,
    `专辑：${track.album || "未知专辑"}`,
    "如果你不了解确切背景，不要编造事实，改为分享听感、氛围和适合聆听的画面。"
  ].join("\n");
}

function buildRadioTrackIntroPrompt(track) {
  return [
    "新歌已经开始播放，请按真实电台 DJ 的方式做一段短串词。",
    "必须只输出 JSON，action.type 必须是 none，不要执行任何播放或搜索动作。",
    `当前北京时间：${formatBeijingRadioTime()}`,
    `上一首：${describeTrackForDj(state.previousTrack)}`,
    `当前歌曲：${describeTrackForDj(track)}`,
    "如果有上一首，请加一句上下首之间的自然过渡。不要每首都说晚上好，要按真实时间和情绪开口。",
    "可以讲一点经典老歌背景、年代趣事、歌手故事或听感画面；不确定的事实不要编造，要转为氛围和感受。",
    "多一点对听众的情绪互动，像正在陪一个人收听。口播 2 到 5 句。"
  ].join("\n");
}

function buildPreparedRadioTrackIntroPrompt(track) {
  const includeTime = shouldMentionTimeForIntro();
  return [
    "请为即将播放的歌曲准备一段真实电台 DJ 串词。必须只输出 JSON，action.type 必须是 none。",
    `当前北京时间：${formatBeijingRadioTime()}`,
    `上一首：${describeTrackForDj(state.previousTrack)}`,
    `即将播放：${describeTrackForDj(track)}`,
    includeTime
      ? "这是开场第一首或时段发生变化，可以自然提一下时间、周几，或从一个时段进入另一个时段的感觉。"
      : "这不是第一首，也没有明显时段变化；不要主动提时间，把重点放在上下首过渡、歌曲故事和听众情绪上。",
    "如果有上一首，请加一句上下首之间的自然过渡。",
    "可以讲一点经典老歌背景、年代趣事、歌手故事或听感画面；不确定的事实不要编造，要转为氛围和感受。",
    "多一点对听众的情绪互动，像正在陪一个人收听。口播 2 到 5 句。"
  ].join("\n");
}

async function introduceCurrentTrack(track) {
  if (!state.appInfo?.hasAiConfig || !window.cloudio?.askDj || !track?.id) return;

  const trackKey = String(track.id);
  if (state.lastIntroducedTrackId === trackKey) return;
  state.lastIntroducedTrackId = trackKey;

  try {
    state.djIntroBusy = true;
    let result = null;
    if (state.preparedIntro?.trackId === trackKey) {
      result = state.preparedIntro.result;
      state.preparedIntro = null;
    } else {
      result = await window.cloudio.askDj({
        messages: [{ role: "user", content: buildPreparedRadioTrackIntroPrompt(track) }],
        player: getPlayerContext()
      });
    }

    if (String(state.tracks[state.index]?.id || "") !== trackKey) return;

    appendDjMessage("assistant", result.reply, { store: false });
    markIntroTimePeriod();
    speakDjText(result.spokenIntro || result.reply);
  } catch (error) {
    appendDjMessage(
      "assistant",
      `这首歌的介绍暂时没连上：${error.message || "DJ is unavailable."}`,
      { store: false }
    );
  } finally {
    state.djIntroBusy = false;
  }
}

async function prepareUpcomingTrackIntro() {
  if (!state.appInfo?.hasAiConfig || !window.cloudio?.askDj || state.tracks.length < 2) return;
  if (!state.playing || state.djIntroBusy) return;

  const current = state.tracks[state.index];
  const upcoming = state.tracks[(state.index + 1) % state.tracks.length];
  const upcomingKey = String(upcoming?.id || "");
  if (!current?.id || !upcomingKey) return;
  if (state.preparedIntro?.trackId === upcomingKey || state.preparingIntroTrackId === upcomingKey) return;

  state.preparingIntroTrackId = upcomingKey;
  const previousTrack = state.previousTrack;
  state.previousTrack = current;

  try {
    const result = await window.cloudio.askDj({
      messages: [{ role: "user", content: buildPreparedRadioTrackIntroPrompt(upcoming) }],
      player: getPlayerContext()
    });
    state.preparedIntro = { trackId: upcomingKey, result };
  } catch {
    // The live intro path will retry if preparation fails.
  } finally {
    state.previousTrack = previousTrack;
    if (state.preparingIntroTrackId === upcomingKey) state.preparingIntroTrackId = "";
  }
}

async function speakDjText(text) {
  const spokenText = String(text || "").trim();
  if (!spokenText || !(state.appInfo?.hasDjVoice || state.appInfo?.hasFishAudio) || !window.cloudio?.speakDj) return;

  try {
    setStatus("DJ voice is warming up...");
    const result = await window.cloudio.speakDj(spokenText);
    if (!result?.audioUrl) return;

    if (state.djAudio) {
      state.djAudio.pause();
      state.djAudio = null;
    }

    const voice = new Audio(result.audioUrl);
    voice.volume = DJ_VOICE_VOLUME;
    state.djAudio = voice;
    const voiceContext = new AudioContext();
    const voiceSource = voiceContext.createMediaElementSource(voice);
    const voiceGain = voiceContext.createGain();
    voiceGain.gain.value = DJ_VOICE_GAIN;
    voiceSource.connect(voiceGain);
    voiceGain.connect(voiceContext.destination);

    voice.addEventListener("play", () => {
      state.ducking = true;
      fadeMusicVolume(effectiveMusicVolume(), 1.5);
      setStatus("DJ on air");
      if (voiceContext.state === "suspended") voiceContext.resume().catch(() => {});
    });

    voice.addEventListener("ended", () => {
      state.ducking = false;
      fadeMusicVolume(effectiveMusicVolume(), 3);
      if (state.djAudio === voice) state.djAudio = null;
      voiceSource.disconnect();
      voiceGain.disconnect();
      voiceContext.close().catch(() => {});
      setStatus();
    });

    voice.addEventListener("error", () => {
      state.ducking = false;
      fadeMusicVolume(effectiveMusicVolume(), 3);
      if (state.djAudio === voice) state.djAudio = null;
      voiceSource.disconnect();
      voiceGain.disconnect();
      voiceContext.close().catch(() => {});
      setStatus("DJ voice failed");
    });

    await voice.play();
  } catch (error) {
    if (/not allowed|gesture|interact|user activation/i.test(error.message || "")) {
      setStatus("Click once, then DJ voice can play");
      return;
    }
    setStatus(error.message || "DJ voice failed");
  }
}

function applyPlaylistData(data) {
  if (!data.tracks.length) throw new Error("This playlist has no visible tracks.");
  state.tracks = data.tracks;
  state.index = 0;
  state.playing = false;
  state.lastIntroducedTrackId = "";
  state.previousTrack = null;
  state.preparedIntro = null;
  state.preparingIntroTrackId = "";
  cancelVolumeFade();
  playlistName.textContent = data.name;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  renderTrack();
  return data;
}

async function loadPlaylist(input) {
  const text = String(input || "").trim();
  if (!text) {
    setStatus("Paste a playlist link or ID first.");
    return;
  }

  if (playlistInput) playlistInput.disabled = true;
  playlistForm?.querySelectorAll("button").forEach((b) => (b.disabled = true));
  setStatus("Loading playlist...");

  try {
    const data = applyPlaylistData(await window.cloudio.getPlaylist(text));
    setStatus(`Loaded ${data.trackCount} tracks`);
    return data;
  } catch (error) {
    setStatus(error.message || "Failed to load playlist");
    return null;
  } finally {
    if (playlistInput) playlistInput.disabled = false;
    playlistForm?.querySelectorAll("button").forEach((b) => (b.disabled = false));
  }
}

async function loadDailyRecommendations({ silent = false } = {}) {
  if (dailyBtn) dailyBtn.disabled = true;
  if (dailyFormBtn) dailyFormBtn.disabled = true;
  if (!silent) setStatus("Loading daily recommendations...");

  try {
    const data = applyPlaylistData(await window.cloudio.getDailyRecommendations());
    setStatus(`Today's daily: ${data.trackCount} tracks`);
    return data;
  } catch (error) {
    setStatus(error.message || "Failed to load daily");
    return null;
  } finally {
    if (dailyBtn) dailyBtn.disabled = false;
    if (dailyFormBtn) dailyFormBtn.disabled = false;
  }
}

async function ensureUserLibrary() {
  if (state.userLibrary) return state.userLibrary;
  if (state.userLibraryPromise) return state.userLibraryPromise;
  state.loadingLibrary = true;
  state.userLibraryPromise = (async () => {
    state.userLibrary = await window.cloudio.getUserLibrary();
    renderFavoritesMenu();
    return state.userLibrary;
  })();

  try {
    return await state.userLibraryPromise;
  } finally {
    state.loadingLibrary = false;
    state.userLibraryPromise = null;
  }
}

function renderFavoritesMenu() {
  if (!favoritesMenuList) return;
  favoritesMenuList.replaceChildren();
  const playlists = state.userLibrary?.playlists || [];
  if (!playlists.length) {
    const empty = document.createElement("span");
    empty.className = "favorite-menu-empty";
    empty.textContent = "No playlists found";
    favoritesMenuList.append(empty);
    return;
  }

  playlists.forEach((item) => {
    const button = document.createElement("button");
    button.className = "favorite-menu-item";
    button.type = "button";
    button.innerHTML = `
      <span class="favorite-menu-name">${escapeHtml(item.name)}</span>
      <span class="favorite-menu-meta">${escapeHtml(String(item.trackCount || 0))} songs</span>
    `;
    button.addEventListener("click", async () => {
      closeFavoritesMenu();
      const data = await loadPlaylist(String(item.id));
      if (data) await playCurrent();
    });
    favoritesMenuList.append(button);
  });
}

function closeFavoritesMenu() {
  if (!favoritesMenu || !favoritesMenuBtn) return;
  favoritesMenu.hidden = true;
  favoritesMenuBtn.setAttribute("aria-expanded", "false");
}

async function toggleFavoritesMenu() {
  if (!favoritesMenu || !favoritesMenuBtn) return;
  const willOpen = favoritesMenu.hidden;
  if (!willOpen) {
    closeFavoritesMenu();
    return;
  }

  favoritesMenu.hidden = false;
  favoritesMenuBtn.setAttribute("aria-expanded", "true");
  setStatus("Loading saved playlists...");
  try {
    await ensureUserLibrary();
    setStatus("Saved playlists ready");
  } catch (error) {
    setStatus(error.message || "Failed to load saved playlists");
  }
}

async function loadHeartMode() {
  if (!heartBtn) return;
  heartBtn.disabled = true;
  setStatus("Loading heart mode...");
  try {
    const data = applyPlaylistData(await window.cloudio.getHeartMode());
    if (data) {
      playlistName.textContent = "心动模式";
      await playCurrent();
    }
  } catch (error) {
    setStatus(error.message || "Failed to load heart mode");
  } finally {
    heartBtn.disabled = false;
  }
}

async function ensureAudioUrl(track) {
  if (!track.id) throw new Error("No NetEase song id.");
  if (track.audioUrl) return track.audioUrl;

  state.loadingUrl = true;
  setTransportBusy(true);
  setStatus("Requesting playable URL...");

  try {
    const result = await window.cloudio.getSongUrl(track.id);
    track.audioUrl = result.url;
    track.level = result.level;
    return track.audioUrl;
  } finally {
    state.loadingUrl = false;
    setTransportBusy(false);
  }
}

async function playCurrent() {
  const track = state.tracks[state.index];
  if (!track?.id) {
    setStatus("Load a playlist first");
    return;
  }

  try {
    const url = await ensureAudioUrl(track);
    if (audio.src !== url) {
      audio.src = url;
      audio.load();
    }
    setMusicVolume(0);
    await audio.play();
    state.playing = true;
    setStatus(track.level ? `Playing · ${track.level}` : "Playing");
    renderTrack();
    fadeMusicVolume(effectiveMusicVolume(), MUSIC_FADE_SECONDS);
    introduceCurrentTrack(track);
  } catch (error) {
    state.playing = false;
    renderTrack();
    setStatus(playbackErrorMessage(error));
  }
}

function pauseCurrent() {
  state.playing = false;
  fadeMusicVolume(0, 1.8);
  setTimeout(() => {
    if (!state.playing) audio.pause();
  }, 1800);
  renderTrack();
}

async function togglePlay() {
  if (state.loadingUrl) return;
  if (state.playing) pauseCurrent();
  else await playCurrent();
}

async function selectTrack(index, autoplay) {
  const outgoingTrack = state.tracks[state.index] || null;
  if (outgoingTrack?.id && outgoingTrack.id !== state.tracks[index]?.id) {
    state.previousTrack = outgoingTrack;
  }
  state.index = index;
  state.playing = false;
  state.lastIntroducedTrackId = "";
  if (state.preparedIntro?.trackId !== String(state.tracks[index]?.id || "")) {
    state.preparedIntro = null;
  }
  cancelVolumeFade();
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  renderTrack();
  if (autoplay) await playCurrent();
}

async function nextTrack() {
  if (state.loadingUrl) return;
  await selectTrack((state.index + 1) % state.tracks.length, true);
}

async function prevTrack() {
  if (state.loadingUrl) return;
  await selectTrack((state.index - 1 + state.tracks.length) % state.tracks.length, true);
}

function toggleViewMode() {
  state.miniMode = !state.miniMode;
  player.classList.toggle("mini-mode", state.miniMode);
  if (window.cloudio?.setViewMode) {
    window.cloudio.setViewMode(state.miniMode ? "mini" : "full");
  }
}

function setContentPane(pane) {
  const showPlaylist = pane === "playlist";
  player.dataset.module = showPlaylist ? "playlist" : "dj";
  playlistTabBtn.classList.toggle("active", showPlaylist);
  sideTabBtn.classList.toggle("active", !showPlaylist);
  playlistTabBtn.setAttribute("aria-selected", String(showPlaylist));
  sideTabBtn.setAttribute("aria-selected", String(!showPlaylist));
  playlistPane.classList.toggle("active", showPlaylist);
  sidePane.classList.toggle("active", !showPlaylist);
}

function firstArtistName(track) {
  return String(track?.artist || "").split(/\s*[/、,，]\s*/).find(Boolean) || String(track?.artist || "").trim();
}

function uniqueTracks(tracks) {
  const seen = new Set();
  return tracks.filter((track) => {
    const id = String(track?.id || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function shuffleTracks(tracks) {
  const shuffled = [...tracks];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

async function shufflePlaylist() {
  if (state.tracks.length < 2 || state.tracks[0] === demoTracks[0]) {
    setStatus("Load a playlist first");
    return;
  }

  const currentTrack = state.tracks[state.index];
  const rest = state.tracks.filter((track, index) => index !== state.index);
  state.tracks = [currentTrack, ...shuffleTracks(rest)];
  state.index = 0;
  state.lastIntroducedTrackId = "";
  state.preparedIntro = null;
  state.preparingIntroTrackId = "";
  renderTrack();
  setStatus(`Shuffled ${state.tracks.length} tracks`);
  await playCurrent();
}

async function buildArtistSongList(seedTrack) {
  const artist = firstArtistName(seedTrack);
  if (!artist) return [seedTrack].filter(Boolean);
  const artistTracks = await window.cloudio.searchSongs(artist, MAX_ACTION_TRACKS);
  return uniqueTracks([seedTrack, ...artistTracks]).slice(0, MAX_ACTION_TRACKS);
}

async function executeDjAction(action) {
  const type = action?.type || "none";
  const input = String(action?.input || "").trim();
  const autoplay = true;

  if (type === "none") return;

  try {
    if (type === "daily") {
      const data = await loadDailyRecommendations();
      if (data && autoplay) await playCurrent();
      return;
    }

    if (type === "load_playlist") {
      const data = await loadPlaylist(input);
      if (data && autoplay) await playCurrent();
      return;
    }

    if (type === "play_song") {
      if (!input) throw new Error("DJ needs a song search query.");
      setStatus(`DJ searching song: ${input}`);
      const tracks = await window.cloudio.searchSongs(input, MAX_ACTION_TRACKS);
      if (!tracks.length) {
        setStatus(`DJ searching playlist: ${input}`);
        const playlists = await window.cloudio.searchPlaylists(input, 8);
        if (!playlists.length) throw new Error("No matching songs or playlists found.");
        const picked = playlists[0];
        appendDjMessage("assistant", `没找到很像的单曲，我先切到更贴近这个氛围的歌单：《${picked.name}》。`, { store: false });
        const data = await loadPlaylist(String(picked.id));
        if (data && autoplay) await playCurrent();
        return;
      }
      const picked = tracks[0];
      const artistTracks = await buildArtistSongList(picked);
      applyPlaylistData({
        id: "dj-artist-songs",
        name: `${firstArtistName(picked) || picked.artist} Radio`,
        trackCount: artistTracks.length,
        tracks: artistTracks
      });
      appendDjMessage("assistant", `我先播 ${picked.title} - ${picked.artist}，歌单也换成这位歌手相关的 ${artistTracks.length} 首。`, { store: false });
      if (autoplay) await playCurrent();
      return;
    }

    if (type === "generate_playlist") {
      if (!input) throw new Error("DJ needs a playlist mood query.");
      setStatus(`DJ searching playlist: ${input}`);
      let playlists = await window.cloudio.searchPlaylists(input, 8);
      if (!playlists.length) {
        const fallbackQuery = input.split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
        if (fallbackQuery && fallbackQuery !== input) {
          playlists = await window.cloudio.searchPlaylists(fallbackQuery, 8);
        }
      }
      if (!playlists.length) throw new Error("No matching playlists found.");
      const picked = playlists[0];
      appendDjMessage("assistant", `我挑了《${picked.name}》。先从这里开播，看看这个氛围对不对。`, { store: false });
      const data = await loadPlaylist(String(picked.id));
      if (data && autoplay) await playCurrent();
    }
  } catch (error) {
    const message = error.message || "DJ action failed.";
    setStatus(message);
    appendDjMessage("assistant", `这一步没接上：${message}`, { store: false });
  }
}

async function ensureMusicAfterDjDialogue() {
  const track = state.tracks[state.index];
  if (!state.playing && track?.id && !state.loadingUrl) {
    await playCurrent();
  }
}

async function sendDjMessage(text) {
  const prompt = String(text || "").trim();
  if (!prompt || state.djBusy) return;

  setContentPane("side");
  appendDjMessage("user", prompt);
  djInput.value = "";
  setDjBusy(true);
  setStatus("DJ is listening...");

  try {
    const result = await window.cloudio.askDj({
      messages: state.djMessages.slice(-12),
      player: getPlayerContext()
    });
    appendDjMessage("assistant", result.reply, { action: result.action });
    setStatus("DJ tuned in");
    speakDjText(result.spokenIntro || result.reply);
    await executeDjAction(result.action);
    await ensureMusicAfterDjDialogue();
  } catch (error) {
    const message = error.message || "DJ is unavailable.";
    setStatus(message);
    appendDjMessage(
      "assistant",
      "我的导播台还没接上线。先在 .env 里配置 OPENAI_API_KEY、OPENAI_BASE_URL 和 OPENAI_MODEL，我就能开麦了。",
      { store: false }
    );
  } finally {
    setDjBusy(false);
    djInput.focus();
  }
}

playlistForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  loadPlaylist(playlistInput?.value);
});

dailyBtn?.addEventListener("click", () => loadDailyRecommendations());
dailyFormBtn?.addEventListener("click", () => loadDailyRecommendations());
shuffleBtn?.addEventListener("click", shufflePlaylist);
settingsBtn?.addEventListener("click", openSettings);
settingsCloseBtn?.addEventListener("click", closeSettings);
settingsForm?.addEventListener("submit", saveSettings);
heartBtn?.addEventListener("click", loadHeartMode);
favoritesMenuBtn?.addEventListener("click", toggleFavoritesMenu);
document.addEventListener("click", (event) => {
  if (event.target?.dataset?.closeSettings !== undefined) {
    closeSettings();
    return;
  }
  if (!favoritesMenu || favoritesMenu.hidden) return;
  if (event.target === favoritesMenuBtn || favoritesMenu.contains(event.target)) return;
  closeFavoritesMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && settingsModal && !settingsModal.hidden) {
    closeSettings();
  }
});
toggleViewBtn.addEventListener("click", toggleViewMode);
minimizeBtn.addEventListener("click", () => window.cloudio?.minimizeWindow?.());
closeBtn.addEventListener("click", () => window.cloudio?.closeWindow?.());
playlistTabBtn.addEventListener("click", () => setContentPane("playlist"));
sideTabBtn.addEventListener("click", () => setContentPane("side"));
djForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendDjMessage(djInput.value);
});
djPromptBtns.forEach((button) => {
  button.addEventListener("click", () => sendDjMessage(button.dataset.prompt));
});

progress.addEventListener("input", () => {
  if (!audio.duration) return;
  audio.currentTime = (Number(progress.value) / 1000) * audio.duration;
  updateProgress();
});

playBtn.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  togglePlay();
});

nextBtn.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  nextTrack();
});

prevBtn.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  prevTrack();
});

audio.addEventListener("timeupdate", updateProgress);
audio.addEventListener("loadedmetadata", updateProgress);
audio.addEventListener("ended", nextTrack);
audio.addEventListener("error", () => {
  state.playing = false;
  renderTrack();
  setStatus(playbackErrorMessage());
});

window.cloudio?.onShortcut?.((action) => {
  if (action === "toggle") togglePlay();
  if (action === "next") nextTrack();
  if (action === "prev") prevTrack();
});

async function boot() {
  state.appInfo = await window.cloudio.ready();
  updateBeijingClock();
  setInterval(updateBeijingClock, 1000);
  renderTrack();
  setStatus();
  appendDjMessage(
    "assistant",
    state.appInfo.hasAiConfig
      ? `晚上好，我是 Cloudio Radio DJ。想听一首歌、一个歌单，或者只想把今天的心情放进音乐里，都可以直接告诉我。${state.appInfo.hasDjVoice || state.appInfo.hasFishAudio ? "我的声音线路也已经接好。" : ""}`
      : `晚上好，我是 Cloudio Radio DJ。等你把 OPENAI_API_KEY、OPENAI_BASE_URL 和 OPENAI_MODEL 写进 .env，我就能正式开麦。`,
    { store: false }
  );

  if (state.appInfo.hasCookie) {
    await loadDailyRecommendations({ silent: true });
  } else {
    setStatus("Add NETEASE_COOKIE to load daily");
  }
}

async function bootRadio() {
  state.appInfo = await window.cloudio.ready();
  updateBeijingClock();
  setInterval(updateBeijingClock, 1000);
  renderTrack();
  setStatus();
  appendDjMessage("assistant", buildBootDjGreeting(), { store: false });

  if (state.appInfo.hasCookie) {
    await loadDailyRecommendations({ silent: true });
  } else {
    setStatus("Add NETEASE_COOKIE to load daily");
  }
}

bootRadio();
