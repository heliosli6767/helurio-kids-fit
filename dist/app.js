const wardrobe = [
  { id: "TOP-01", type: "top", color: "yellow", colorZh: "亮黄色", name: "阳光黄基础 T 恤", style: "纯棉圆领", image: "./assets/wardrobe/top-01-yellow-classic.png", prompt: "a sunshine-yellow classic cotton T-shirt" },
  { id: "TOP-02", type: "top", color: "red", colorZh: "红色", name: "樱桃红基础 T 恤", style: "纯棉圆领", image: "./assets/wardrobe/top-02-red-classic.png", prompt: "a cherry-red classic cotton T-shirt" },
  { id: "TOP-03", type: "top", color: "white", colorZh: "白色", name: "云朵白基础 T 恤", style: "纯棉圆领", image: "./assets/wardrobe/top-03-white-classic.png", prompt: "a crisp white classic cotton T-shirt" },
  { id: "TOP-04", type: "top", color: "yellow", colorZh: "芥末黄", name: "芥末黄口袋 T 恤", style: "竹节棉口袋款", image: "./assets/wardrobe/top-04-mustard-pocket.png", prompt: "a mustard-yellow slub cotton pocket T-shirt" },
  { id: "TOP-05", type: "top", color: "white-red", colorZh: "白红拼色", name: "白红滚边 T 恤", style: "复古撞色领", image: "./assets/wardrobe/top-05-white-red-ringer.png", prompt: "a white cotton ringer T-shirt with red collar and sleeve trim" },
  { id: "BOTTOM-01", type: "bottom", color: "red", colorZh: "红色", name: "活力红束脚裤", style: "柔软针织", image: "./assets/wardrobe/bottom-01-red-jogger.png", prompt: "bright red cotton jogger pants" },
  { id: "BOTTOM-02", type: "bottom", color: "white", colorZh: "白色", name: "雪白工装裤", style: "轻薄工装", image: "./assets/wardrobe/bottom-02-white-cargo.png", prompt: "crisp white lightweight cargo pants" },
  { id: "BOTTOM-03", type: "bottom", color: "black", colorZh: "黑色", name: "墨黑直筒牛仔裤", style: "柔软牛仔", image: "./assets/wardrobe/bottom-03-black-jeans.png", prompt: "black straight-leg denim jeans" },
  { id: "BOTTOM-04", type: "bottom", color: "green", colorZh: "森林绿", name: "森林绿休闲裤", style: "棉质斜纹", image: "./assets/wardrobe/bottom-04-green-chino.png", prompt: "forest-green straight-leg chino pants" },
  { id: "BOTTOM-05", type: "bottom", color: "yellow", colorZh: "亮黄色", name: "亮黄运动裤", style: "白色侧条纹", image: "./assets/wardrobe/bottom-05-yellow-track.png", prompt: "sunny yellow relaxed track pants with a white side stripe" }
];

const state = {
  filter: "all",
  selected: { top: null, bottom: null },
  cameraStream: null,
  lucyClient: null,
  recognition: null,
  recognitionRunning: false,
  voiceActive: false,
  usingRecordingFallback: false,
  voiceRestartTimer: null,
  recorder: null,
  recordingStream: null,
  recordingChunks: [],
  recordingTimer: null,
  discardRecording: false,
  commandQueue: Promise.resolve(),
  speechResultReceived: false,
  settings: {
    startluxEndpoint: sessionStorage.getItem("startluxEndpoint") || "http://127.0.0.1:8000/v1/systemone",
    startluxModel: sessionStorage.getItem("startluxModel") || "startlux",
    speechEndpoint: sessionStorage.getItem("speechEndpoint") || "http://127.0.0.1:8001/v1/audio/transcriptions",
    lucyKey: sessionStorage.getItem("lucyKey") || ""
  },
  lastDecision: { ok: false, error: "尚未调用 STARTLUX" }
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  grid: $("#catalogGrid"), input: $("#commandInput"), mic: $("#micButton"), send: $("#sendButton"),
  camera: $("#cameraButton"), inputVideo: $("#inputVideo"), outputVideo: $("#outputVideo"), cameraEmpty: $("#cameraEmpty"),
  settingsButton: $("#settingsButton"), settingsDialog: $("#settingsDialog"), settingsForm: $("#settingsForm"),
  endpoint: $("#startluxEndpoint"), model: $("#startluxModel"), speechEndpoint: $("#speechEndpoint"), lucyKey: $("#lucyKey"),
  systemState: $("#systemState"), liveLabel: $("#liveLabel"), voiceHint: $("#voiceHint"),
  decisionTitle: $("#decisionTitle"), decisionDetail: $("#decisionDetail"), lookText: $("#lookText"), toast: $("#toast")
};

function renderWardrobe() {
  const visible = wardrobe;
  elements.grid.innerHTML = visible.map(item => `
    <button class="garment-card ${state.selected[item.type]?.id === item.id ? "selected" : ""}" type="button" data-id="${item.id}" aria-label="试穿${item.name}">
      <span class="item-id">${item.id}</span><span class="checkmark">✓</span>
      <img src="${item.image}" alt="${item.name}" />
      <strong>${item.name}</strong><small>${item.colorZh} · ${item.style}</small>
    </button>`).join("");
  elements.grid.querySelectorAll(".garment-card").forEach(card => card.addEventListener("click", () => selectItems([card.dataset.id], "手动选择")));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("show"), 2800);
}

function setBusy(busy) {
  elements.send.disabled = busy;
  elements.systemState.classList.toggle("online", !busy);
  elements.systemState.innerHTML = `<i></i> ${busy ? "STARTLUX 判断中" : "系统就绪"}`;
}

function setVoiceUi(active, message) {
  elements.mic.classList.toggle("listening", active);
  elements.mic.setAttribute("aria-label", active ? "停止连续语音选择" : "开始连续语音选择");
  elements.mic.title = active ? "停止聆听" : "开始聆听";
  if (message) elements.voiceHint.textContent = message;
}

function queueStartluxCommand(command) {
  state.commandQueue = state.commandQueue
    .catch(() => undefined)
    .then(() => decideWithStartlux(command));
  return state.commandQueue;
}

function friendlyFetchError(error, endpoint, serviceName) {
  const isFetchFailure = error instanceof TypeError || /failed to fetch|load failed|networkerror/i.test(error?.message || "");
  if (!isFetchFailure) return error.message;
  let localHttp = false;
  try {
    const url = new URL(endpoint);
    localHttp = url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch (_) {}
  if (localHttp) {
    return `无法连接本机 ${serviceName}。请确认服务已启动，并允许本站通过 CORS / 本地网络权限访问 ${endpoint}`;
  }
  return `无法连接 ${serviceName}，请检查接口地址、网络与 CORS 设置`;
}

function currentLookText() {
  const names = [state.selected.top?.name, state.selected.bottom?.name].filter(Boolean);
  return names.length ? names.join(" + ") : "还没有选择服装";
}

async function selectItems(ids, source = "STARTLUX") {
  const selected = ids.map(id => wardrobe.find(item => item.id === id)).filter(Boolean);
  if (!selected.length) throw new Error("STARTLUX 没有返回有效服装标签");
  selected.forEach(item => { state.selected[item.type] = item; });
  renderWardrobe();
  elements.lookText.textContent = currentLookText();
  elements.decisionTitle.textContent = `${source} 已选择 ${selected.map(i => i.id).join(" · ")}`;
  elements.decisionDetail.textContent = selected.map(i => i.name).join(" + ");
  await applyLucyLook();
}

function readDecisionLabel(result, key) {
  const candidate = result?.results?.[key] ?? result?.answers?.[key] ?? result?.[key];
  if (typeof candidate === "string") return candidate;
  return candidate?.label ?? candidate?.choice ?? candidate?.value ?? candidate?.answer ?? null;
}

async function decideWithStartlux(command) {
  if (!command.trim()) return;
  setBusy(true);
  elements.voiceHint.textContent = `正在判断：“${command}”`;
  const tops = Object.fromEntries(wardrobe.filter(i => i.type === "top").map(i => [i.id, `${i.colorZh}，${i.name}，${i.style}`]));
  const bottoms = Object.fromEntries(wardrobe.filter(i => i.type === "bottom").map(i => [i.id, `${i.colorZh}，${i.name}，${i.style}`]));
  tops.NO_CHANGE = "用户没有要求更换上衣";
  bottoms.NO_CHANGE = "用户没有要求更换裤装";
  const payload = {
    model: state.settings.startluxModel,
    state: JSON.stringify({ user_request: command, current_top: state.selected.top?.id || null, current_bottom: state.selected.bottom?.id || null, language: "zh-CN" }),
    questions: {
      top: { type: "choice", instructions: "根据用户原话选择最匹配的儿童上衣；若用户没有要求更换上衣，必须选择 NO_CHANGE。", criteria: tops },
      bottom: { type: "choice", instructions: "根据用户原话选择最匹配的儿童裤装；若用户没有要求更换裤装，必须选择 NO_CHANGE。", criteria: bottoms }
    }
  };
  try {
    const response = await fetch(state.settings.startluxEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    const ids = [readDecisionLabel(result, "top"), readDecisionLabel(result, "bottom")].filter(id => id && id !== "NO_CHANGE");
    if (!ids.length) throw new Error("没有需要更换的服装");
    await selectItems(ids);
    state.lastDecision = { ok: true, ids };
    elements.voiceHint.textContent = state.voiceActive ? `已执行：“${command}” · 继续聆听中` : `已识别：“${command}”`;
  } catch (error) {
    const message = friendlyFetchError(error, state.settings.startluxEndpoint, "STARTLUX");
    state.lastDecision = { ok: false, error: message };
    elements.decisionTitle.textContent = "STARTLUX 连接失败";
    elements.decisionDetail.textContent = message;
    elements.voiceHint.textContent = state.voiceActive ? "STARTLUX 未连接 · 语音仍在聆听" : "请启动本地接口并检查跨域设置";
    showToast(message);
  } finally { setBusy(false); }
}

async function composeOutfitReference() {
  const selected = [state.selected.top, state.selected.bottom].filter(Boolean);
  if (!selected.length) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1024; canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f5f7fb"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const images = await Promise.all(selected.map(item => new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve({ image, item }); image.onerror = reject; image.src = item.image;
  })));
  const width = selected.length === 1 ? 650 : 470;
  images.forEach(({ image }, index) => {
    const scale = Math.min(width / image.width, 820 / image.height);
    const w = image.width * scale, h = image.height * scale;
    const x = selected.length === 1 ? (1024 - w) / 2 : index * 512 + (512 - w) / 2;
    ctx.drawImage(image, x, (1024 - h) / 2, w, h);
  });
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
  return new File([blob], "startlux-outfit.png", { type: "image/png" });
}

async function applyLucyLook() {
  if (!state.cameraStream) { showToast("服装已选好，打开摄像头即可试穿"); return; }
  if (!state.lucyClient) { showToast("已更新搭配；填写 Lucy API Key 后可生成试衣画面"); return; }
  const reference = await composeOutfitReference();
  const prompt = [state.selected.top?.prompt, state.selected.bottom?.prompt].filter(Boolean).join(" and ");
  try {
    elements.liveLabel.textContent = "LUCY APPLYING";
    await state.lucyClient.set({
      image: reference,
      prompt: `Dress the same person in ${prompt}. Keep the person's identity, face, body shape, pose, camera framing, lighting and background unchanged. Change only the clothing.`
    });
    elements.liveLabel.textContent = "LUCY LIVE";
    showToast("Lucy 正在更新试衣画面");
  } catch (error) {
    elements.liveLabel.textContent = "LUCY ERROR";
    showToast(`Lucy 更新失败：${error.message}`);
  }
}

async function startCamera() {
  try {
    if (!state.cameraStream) state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    elements.inputVideo.srcObject = state.cameraStream;
    elements.inputVideo.style.display = "block";
    elements.cameraEmpty.style.display = "none";
    elements.camera.textContent = "摄像头已开启";
    elements.systemState.classList.add("online");
    elements.systemState.innerHTML = "<i></i> 摄像头已连接";
    if (state.settings.lucyKey && !state.lucyClient) await connectLucy();
  } catch (error) { showToast(`无法打开摄像头：${error.message}`); }
}

async function connectLucy() {
  try {
    elements.liveLabel.textContent = "LUCY CONNECTING";
    elements.outputVideo.style.display = "none";
    elements.outputVideo.srcObject = null;
    const { createDecartClient, models } = await import("https://esm.sh/@decartai/sdk?bundle");
    const model = models.realtime("lucy-vton-3.5");
    const client = createDecartClient({ apiKey: state.settings.lucyKey });
    state.lucyClient = await client.realtime.connect(state.cameraStream, {
      model,
      mirror: "auto",
      onRemoteStream: (stream) => {
        elements.outputVideo.srcObject = stream;
        elements.outputVideo.style.display = "block";
        elements.inputVideo.style.display = "none";
        elements.liveLabel.textContent = "LUCY LIVE";
      }
    });
    if (state.selected.top || state.selected.bottom) await applyLucyLook();
  } catch (error) {
    state.lucyClient = null;
    elements.inputVideo.style.display = "block";
    elements.outputVideo.style.display = "none";
    elements.liveLabel.textContent = "CAMERA PREVIEW";
    showToast(`Lucy 连接失败：${error.message}`);
  }
}

function setupVoice() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    elements.voiceHint.textContent = "点击一次开始连续聆听，再次点击停止";
    return;
  }
  state.recognition = new Recognition();
  state.recognition.lang = "zh-CN";
  state.recognition.interimResults = false;
  state.recognition.continuous = true;
  state.recognition.onstart = () => {
    state.recognitionRunning = true;
    state.speechResultReceived = false;
    setVoiceUi(true, "持续聆听中 · 直接说“换黄色上衣”或“换黑色裤子”");
  };
  state.recognition.onend = () => {
    state.recognitionRunning = false;
    if (!state.voiceActive || state.usingRecordingFallback) return;
    clearTimeout(state.voiceRestartTimer);
    state.voiceRestartTimer = setTimeout(startRecognitionCycle, 300);
  };
  state.recognition.onerror = event => {
    state.recognitionRunning = false;
    if (!state.voiceActive || event.error === "aborted") return;
    if (["network", "service-not-allowed", "language-not-supported"].includes(event.error)) {
      elements.voiceHint.textContent = "浏览器识别不可用，正在切换本地录音…";
      state.usingRecordingFallback = true;
      startRecordingFallback();
    } else if (!['no-speech'].includes(event.error)) {
      elements.voiceHint.textContent = `语音识别失败：${event.error}`;
    }
  };
  state.recognition.onresult = event => {
    state.speechResultReceived = true;
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      if (!event.results[index].isFinal) continue;
      const transcript = event.results[index][0].transcript.trim();
      if (!transcript) continue;
      elements.input.value = transcript;
      queueStartluxCommand(transcript);
    }
  };
}

function startRecognitionCycle() {
  if (!state.voiceActive || state.usingRecordingFallback || !state.recognition || state.recognitionRunning) return;
  try { state.recognition.start(); }
  catch (error) {
    if (error.name !== "InvalidStateError") {
      state.usingRecordingFallback = true;
      startRecordingFallback();
    }
  }
}

function stopVoiceSession() {
  state.voiceActive = false;
  clearTimeout(state.voiceRestartTimer);
  clearTimeout(state.recordingTimer);
  if (state.recognitionRunning) {
    try { state.recognition.stop(); } catch (_) {}
  }
  if (state.recorder?.state === "recording") {
    state.discardRecording = true;
    state.recorder.stop();
  }
  state.recordingStream?.getTracks().forEach(track => track.stop());
  state.recordingStream = null;
  state.usingRecordingFallback = false;
  setVoiceUi(false, "语音已停止 · 点击麦克风可再次连续聆听");
}

async function startVoiceInput() {
  if (state.voiceActive) { stopVoiceSession(); return; }
  try {
    elements.voiceHint.textContent = "正在请求麦克风权限…";
    const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    permissionStream.getTracks().forEach(track => track.stop());
    state.voiceActive = true;
    state.usingRecordingFallback = !state.recognition;
    setVoiceUi(true, "持续聆听中 · 再次点击麦克风停止");
    if (state.recognition) {
      startRecognitionCycle();
      return;
    }
    await startRecordingFallback();
  } catch (error) {
    state.voiceActive = false;
    setVoiceUi(false);
    elements.voiceHint.textContent = error.name === "NotAllowedError"
      ? "请允许麦克风权限后再次点击"
      : `无法打开麦克风：${error.message}`;
    showToast(elements.voiceHint.textContent);
  }
}

async function startRecordingFallback() {
  if (!state.voiceActive || state.recorder?.state === "recording") return;
  if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
    elements.voiceHint.textContent = "此浏览器无法录音，请使用文字输入";
    stopVoiceSession();
    return;
  }
  try {
    if (!state.recordingStream?.active) state.recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.recordingChunks = [];
    state.discardRecording = false;
    const preferredType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
    state.recorder = new MediaRecorder(state.recordingStream, preferredType ? { mimeType: preferredType } : undefined);
    state.recorder.ondataavailable = event => { if (event.data.size) state.recordingChunks.push(event.data); };
    state.recorder.onstop = transcribeRecording;
    state.recorder.start();
    setVoiceUi(true, "持续聆听中 · 可连续说出换衣指令，再次点击停止");
    clearTimeout(state.recordingTimer);
    state.recordingTimer = setTimeout(() => { if (state.recorder?.state === "recording") state.recorder.stop(); }, 5500);
  } catch (error) {
    elements.voiceHint.textContent = `无法开始录音：${error.message}`;
    stopVoiceSession();
  }
}

async function transcribeRecording() {
  clearTimeout(state.recordingTimer);
  const type = state.recorder?.mimeType || "audio/webm";
  const blob = new Blob(state.recordingChunks, { type });
  if (state.discardRecording || !blob.size) {
    state.recorder = null;
    state.discardRecording = false;
    return;
  }
  elements.voiceHint.textContent = "正在本地转写语音…";
  try {
    const form = new FormData();
    form.append("file", new File([blob], "helurio-command.webm", { type }));
    form.append("model", "whisper-1");
    form.append("language", "zh");
    const response = await fetch(state.settings.speechEndpoint, { method: "POST", body: form });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    const transcript = result.text || result.transcript;
    if (!transcript) throw new Error("转写接口没有返回 text");
    elements.input.value = transcript;
    await queueStartluxCommand(transcript);
  } catch (error) {
    const message = friendlyFetchError(error, state.settings.speechEndpoint, "语音转写服务");
    elements.voiceHint.textContent = state.voiceActive ? "语音转写服务未连接 · 将继续尝试" : message;
    showToast(message);
  } finally {
    state.recorder = null;
    if (state.voiceActive && state.usingRecordingFallback) {
      setTimeout(startRecordingFallback, 250);
    } else {
      state.recordingStream?.getTracks().forEach(track => track.stop());
      state.recordingStream = null;
    }
  }
}

elements.send.addEventListener("click", () => queueStartluxCommand(elements.input.value));
elements.input.addEventListener("keydown", event => { if (event.key === "Enter") queueStartluxCommand(elements.input.value); });
elements.mic.addEventListener("click", startVoiceInput);
elements.camera.addEventListener("click", startCamera);
elements.settingsButton.addEventListener("click", () => {
  elements.endpoint.value = state.settings.startluxEndpoint;
  elements.model.value = state.settings.startluxModel;
  elements.speechEndpoint.value = state.settings.speechEndpoint;
  elements.lucyKey.value = state.settings.lucyKey;
  elements.settingsDialog.showModal();
});
elements.settingsForm.addEventListener("submit", event => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const previousLucyKey = state.settings.lucyKey;
  state.settings = { startluxEndpoint: elements.endpoint.value.trim(), startluxModel: elements.model.value.trim(), speechEndpoint: elements.speechEndpoint.value.trim(), lucyKey: elements.lucyKey.value.trim() };
  Object.entries(state.settings).forEach(([key, value]) => sessionStorage.setItem(key, value));
  elements.settingsDialog.close();
  showToast("接口设置已保存");
  if (previousLucyKey !== state.settings.lucyKey && state.lucyClient) {
    state.lucyClient.disconnect?.();
    state.lucyClient = null;
  }
  if (state.cameraStream && state.settings.lucyKey && !state.lucyClient) connectLucy();
});

function registerWebMCP() {
  if (!document.modelContext?.registerTool) return;
  document.modelContext.registerTool({
    name: "request_startlux_outfit",
    title: "用 STARTLUX 选择试穿服装",
    description: "把自然语言穿搭要求交给本地 STARTLUX，并将选中的儿童服装应用到当前试衣画面。",
    inputSchema: { type: "object", properties: { request: { type: "string" } }, required: ["request"], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input) {
      if (!input || typeof input.request !== "string" || !input.request.trim()) throw new Error("request 必须是非空字符串");
      elements.input.value = input.request;
      await decideWithStartlux(input.request);
      if (!state.lastDecision.ok) throw new Error(state.lastDecision.error);
      return { selectedTop: state.selected.top?.id || null, selectedBottom: state.selected.bottom?.id || null };
    }
  });
}

renderWardrobe();
setupVoice();
registerWebMCP();
elements.endpoint.value = state.settings.startluxEndpoint;
elements.model.value = state.settings.startluxModel;
elements.speechEndpoint.value = state.settings.speechEndpoint;
elements.lucyKey.value = state.settings.lucyKey;
