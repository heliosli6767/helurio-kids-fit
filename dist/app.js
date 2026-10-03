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
  filter: "top",
  selected: { top: null, bottom: null },
  cameraStream: null,
  lucyClient: null,
  recognition: null,
  settings: {
    startluxEndpoint: sessionStorage.getItem("startluxEndpoint") || "http://127.0.0.1:8000/v1/systemone",
    startluxModel: sessionStorage.getItem("startluxModel") || "startlux",
    lucyKey: sessionStorage.getItem("lucyKey") || ""
  },
  lastDecision: { ok: false, error: "尚未调用 STARTLUX" }
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  grid: $("#catalogGrid"), input: $("#commandInput"), mic: $("#micButton"), send: $("#sendButton"),
  camera: $("#cameraButton"), inputVideo: $("#inputVideo"), outputVideo: $("#outputVideo"), cameraEmpty: $("#cameraEmpty"),
  settingsButton: $("#settingsButton"), settingsDialog: $("#settingsDialog"), settingsForm: $("#settingsForm"),
  endpoint: $("#startluxEndpoint"), model: $("#startluxModel"), lucyKey: $("#lucyKey"),
  systemState: $("#systemState"), liveLabel: $("#liveLabel"), voiceHint: $("#voiceHint"),
  decisionTitle: $("#decisionTitle"), decisionDetail: $("#decisionDetail"), lookText: $("#lookText"), toast: $("#toast")
};

function renderWardrobe() {
  const visible = wardrobe.filter(item => state.filter === "all" || item.type === state.filter);
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
  elements.mic.disabled = busy;
  elements.send.disabled = busy;
  elements.systemState.classList.toggle("online", !busy);
  elements.systemState.innerHTML = `<i></i> ${busy ? "STARTLUX 判断中" : "系统就绪"}`;
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
    elements.voiceHint.textContent = `已识别：“${command}”`;
  } catch (error) {
    state.lastDecision = { ok: false, error: error.message };
    elements.decisionTitle.textContent = "STARTLUX 连接失败";
    elements.decisionDetail.textContent = error.message;
    elements.voiceHint.textContent = "请检查本地接口与跨域设置";
    showToast(`STARTLUX：${error.message}`);
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
    await state.lucyClient.set({ image: reference, prompt: { text: `Dress the child subject in ${prompt}. Preserve identity, body shape, pose, background and movement.`, enhance: true } });
    elements.liveLabel.textContent = "LUCY LIVE";
    showToast("Lucy 正在更新试衣画面");
  } catch (error) { showToast(`Lucy 更新失败：${error.message}`); }
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
    const { createDecartClient, models } = await import("https://esm.sh/@decartai/sdk?bundle");
    const model = models.realtime("lucy-vton-3.5");
    const client = createDecartClient({ apiKey: state.settings.lucyKey });
    state.lucyClient = await client.realtime.connect(state.cameraStream, {
      model,
      mirror: "auto",
      onRemoteStream: (stream) => {
        elements.outputVideo.srcObject = stream;
        elements.outputVideo.style.display = "block";
        elements.liveLabel.textContent = "LUCY LIVE";
      },
      initialState: { prompt: { text: "Preserve the subject, pose, background and current clothing.", enhance: true } }
    });
    if (state.selected.top || state.selected.bottom) await applyLucyLook();
  } catch (error) {
    state.lucyClient = null;
    elements.liveLabel.textContent = "CAMERA PREVIEW";
    showToast(`Lucy 连接失败：${error.message}`);
  }
}

function setupVoice() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    elements.voiceHint.textContent = "当前浏览器不支持语音识别，可输入文字后点击应用";
    elements.mic.disabled = true;
    return;
  }
  state.recognition = new Recognition();
  state.recognition.lang = "zh-CN";
  state.recognition.interimResults = false;
  state.recognition.continuous = false;
  state.recognition.onstart = () => { elements.mic.classList.add("listening"); elements.voiceHint.textContent = "正在听，请说出颜色和服装…"; };
  state.recognition.onend = () => elements.mic.classList.remove("listening");
  state.recognition.onerror = event => { elements.voiceHint.textContent = `语音识别失败：${event.error}`; };
  state.recognition.onresult = event => {
    const transcript = event.results[0][0].transcript;
    elements.input.value = transcript;
    decideWithStartlux(transcript);
  };
}

document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(t => { t.classList.toggle("active", t === tab); t.setAttribute("aria-selected", t === tab ? "true" : "false"); });
  state.filter = tab.dataset.filter; renderWardrobe();
}));
elements.send.addEventListener("click", () => decideWithStartlux(elements.input.value));
elements.input.addEventListener("keydown", event => { if (event.key === "Enter") decideWithStartlux(elements.input.value); });
elements.mic.addEventListener("click", () => state.recognition?.start());
elements.camera.addEventListener("click", startCamera);
elements.settingsButton.addEventListener("click", () => {
  elements.endpoint.value = state.settings.startluxEndpoint;
  elements.model.value = state.settings.startluxModel;
  elements.lucyKey.value = state.settings.lucyKey;
  elements.settingsDialog.showModal();
});
elements.settingsForm.addEventListener("submit", event => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  state.settings = { startluxEndpoint: elements.endpoint.value.trim(), startluxModel: elements.model.value.trim(), lucyKey: elements.lucyKey.value.trim() };
  Object.entries(state.settings).forEach(([key, value]) => sessionStorage.setItem(key, value));
  elements.settingsDialog.close();
  showToast("接口设置已保存");
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
elements.lucyKey.value = state.settings.lucyKey;
