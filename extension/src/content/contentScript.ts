import type { CaptureMode, GoalTrack, LearningSession, SourceType } from "../shared/types";

const maxChars = 80_000;
const notebookLookupButtonId = "lca-vocab-lookup-button";
const notebookLookupPanelId = "lca-vocab-lookup-panel";
const imageDropTargetId = "lca-image-drop-target";
const vocabApiBaseUrl = "http://127.0.0.1:3333";
let notebookSpeechVoices: SpeechSynthesisVoice[] = [];
let selectedNotebookVoiceURI = "";

type VocabLookupResponse =
  | {
      ok: true;
      result: VocabLookupResult;
      saveStatus?: "saved" | "alreadySaved" | "failed" | "skipped";
      saveError?: string;
    }
  | {
      ok: false;
      error: string;
    };

type VocabLookupResult = {
  term: string;
  definition: string;
  chineseDefinition?: string;
  legalContext?: string;
  lookupQuality?: "oxford" | "cambridge" | "merriam-webster" | "ai-legal" | "legal-glossary" | "saved" | "reference" | "dictionary";
  sourceLabel?: string;
  lookupWarning?: string;
  phonetic?: string;
  pronunciation?: string;
  found: boolean;
};

setupCaptureListener();
setupNotebookLmVocabLookup();
setupImageDropBridge();

function setupCaptureListener() {
  const globalWindow = window as Window & { __lcaCaptureListenerReady?: boolean };
  if (globalWindow.__lcaCaptureListenerReady) return;
  globalWindow.__lcaCaptureListenerReady = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "CAPTURE_CURRENT_PAGE") {
      return false;
    }

    try {
      sendResponse({
        ok: true,
        session: captureCurrentPage(
          message.mode ?? "page",
          message.goal,
          message.primaryGoalTrack,
          message.subject
        )
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "无法获取网页内容。"
      });
    }

    return true;
  });
}

function captureCurrentPage(mode: CaptureMode, goal?: string, primaryGoalTrack?: GoalTrack, subject?: string): LearningSession {
  const selectedText = window.getSelection()?.toString() || "";
  const rawText = mode === "selection" ? selectedText : extractReadableText();

  if (!rawText.trim()) {
    throw new Error(mode === "selection" ? "当前网页没有选中文字。" : "当前网页没有可读取的文字。");
  }

  return {
    id: crypto.randomUUID(),
    goal: typeof goal === "string" && goal.trim() ? goal.trim() : undefined,
    primaryGoalTrack: primaryGoalTrack ?? "LLM",
    subject: subject || "Canadian Constitutional Law",
    sourceType: detectSourceType(window.location.hostname, window.location.href),
    title: document.title || "未命名网页",
    url: window.location.href,
    capturedAt: new Date().toISOString(),
    rawText: cleanText(rawText)
  };
}

function detectSourceType(hostname: string, href: string): SourceType {
  if (hostname === "chatgpt.com" || hostname.endsWith(".chatgpt.com")) {
    return "chatgpt";
  }

  if (hostname === "notebooklm.google.com") {
    return "notebooklm";
  }

  if (hostname === "youtube.com" || hostname.endsWith(".youtube.com")) {
    return "youtube";
  }

  if (href.toLowerCase().includes(".pdf") || document.contentType === "application/pdf") {
    return "pdf";
  }

  return "webpage";
}

function extractReadableText(): string {
  const root = document.querySelector("main") ?? document.body;
  return root?.innerText || "";
}

function cleanText(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 3)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, maxChars);
}

function setupNotebookLmVocabLookup() {
  const globalWindow = window as Window & { __lcaNotebookVocabLookupReady?: boolean };
  if (globalWindow.__lcaNotebookVocabLookupReady) return;
  globalWindow.__lcaNotebookVocabLookupReady = true;

  loadNotebookSpeechVoices();
  if ("speechSynthesis" in window) {
    window.speechSynthesis.addEventListener("voiceschanged", loadNotebookSpeechVoices);
  }

  document.addEventListener("mouseup", () => {
    window.setTimeout(showLookupButtonForSelection, 0);
  });
  document.addEventListener("keyup", (event) => {
    if (event.key === "Escape") {
      hideLookupButton();
      hideLookupPanel();
      return;
    }
    showLookupButtonForSelection();
  });
  document.addEventListener("scroll", hideLookupButton, true);
}

function setupImageDropBridge() {
  if (isLocalVocabApp()) {
    deliverPendingImageToVocabApp();
  }
}

function isLocalVocabApp(): boolean {
  return (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    && window.location.port === "5174";
}

async function deliverPendingImageToVocabApp() {
  const params = new URLSearchParams(window.location.search);
  const imageKey = params.get("imageLookup");
  if (!imageKey) return;

  try {
    const result = await chrome.storage.local.get(imageKey);
    const payload = result[imageKey];
    if (!payload || typeof payload.dataUrl !== "string") return;

    window.postMessage({
      type: "LCA_IMAGE_WORD_LOOKUP",
      lookupEventId: imageKey,
      name: typeof payload.name === "string" ? payload.name : "dropped-image.png",
      mimeType: typeof payload.mimeType === "string" ? payload.mimeType : "image/png",
      dataUrl: payload.dataUrl
    }, window.location.origin);

    await chrome.storage.local.remove(imageKey);
  } catch {
    window.postMessage({
      type: "LCA_IMAGE_WORD_LOOKUP_ERROR",
      message: "无法读取拖入的图片，请重新拖入。"
    }, window.location.origin);
  }
}

function getOrCreateImageDropTarget(): HTMLDivElement {
  const existing = document.getElementById(imageDropTargetId);
  if (existing instanceof HTMLDivElement) return existing;

  const target = document.createElement("div");
  target.id = imageDropTargetId;
  target.title = "把词汇图片拖到这里识别";
  target.textContent = "图";
  Object.assign(target.style, {
    position: "fixed",
    right: "18px",
    bottom: "18px",
    zIndex: "2147483646",
    alignItems: "center",
    background: "#214c5f",
    border: "2px solid #dbe7ec",
    borderRadius: "999px",
    boxShadow: "0 12px 32px rgba(20, 35, 44, 0.26)",
    color: "#fff",
    display: "flex",
    font: "700 14px PingFang SC, -apple-system, BlinkMacSystemFont, Microsoft YaHei, sans-serif",
    height: "54px",
    justifyContent: "center",
    letterSpacing: "0",
    opacity: "0.92",
    userSelect: "none",
    width: "54px"
  });

  target.addEventListener("dragenter", (event) => {
    if (!hasDraggedImage(event.dataTransfer)) return;
    event.preventDefault();
    setImageDropTargetActive(target, true);
  });
  target.addEventListener("dragover", (event) => {
    if (!hasDraggedImage(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = "copy";
    setImageDropTargetActive(target, true);
  });
  target.addEventListener("dragleave", () => setImageDropTargetActive(target, false));
  target.addEventListener("drop", (event) => {
    if (!hasDraggedImage(event.dataTransfer)) return;
    event.preventDefault();
    setImageDropTargetActive(target, false);
    const file = Array.from(event.dataTransfer?.files ?? []).find((candidate) => candidate.type.startsWith("image/"));
    if (!file) return;
    void openVocabAppWithDroppedImage(file, target);
  });

  document.body.append(target);
  return target;
}

function setImageDropTargetActive(target: HTMLDivElement, active: boolean) {
  target.textContent = active ? "放" : "图";
  target.style.background = active ? "#c68a2b" : "#17263c";
  target.style.transform = active ? "scale(1.08)" : "scale(1)";
}

function hasDraggedImage(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.items ?? []).some((item) => item.kind === "file" && item.type.startsWith("image/"))
    || Array.from(dataTransfer.files ?? []).some((file) => file.type.startsWith("image/"));
}

async function openVocabAppWithDroppedImage(file: File, target: HTMLDivElement) {
  try {
    target.textContent = "...";
    const dataUrl = await readFileAsDataUrl(file);
    const response = await chrome.runtime.sendMessage({
      type: "VOCAB_OPEN_IMAGE_LOOKUP",
      name: file.name,
      mimeType: file.type,
      dataUrl
    }) as { ok: boolean; error?: string };
    if (!response?.ok) throw new Error(response?.error || "无法打开查词页面。");
  } catch (error) {
    target.textContent = "错";
    window.setTimeout(() => setImageDropTargetActive(target, false), 1400);
    showLookupPanel({
      term: file.name || "image",
      status: error instanceof Error ? error.message : "无法打开图片识词。",
      isError: true
    });
  } finally {
    window.setTimeout(() => setImageDropTargetActive(target, false), 800);
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(new Error("无法读取图片文件。")));
    reader.readAsDataURL(file);
  });
}

function showLookupButtonForSelection() {
  const selectedTerm = getSelectedLookupText();
  if (!selectedTerm) {
    hideLookupButton();
    return;
  }

  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const rect = range?.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return;

  const button = getOrCreateLookupButton();
  button.textContent = "查词";
  button.style.left = `${Math.min(window.innerWidth - 96, Math.max(12, rect.left + window.scrollX))}px`;
  button.style.top = `${Math.max(12, rect.bottom + window.scrollY + 8)}px`;
  button.dataset.term = selectedTerm;
  button.hidden = false;
}

function getOrCreateLookupButton(): HTMLButtonElement {
  const existing = document.getElementById(notebookLookupButtonId);
  if (existing instanceof HTMLButtonElement) return existing;

  const button = document.createElement("button");
  button.id = notebookLookupButtonId;
  button.type = "button";
  Object.assign(button.style, {
    position: "absolute",
    zIndex: "2147483647",
    border: "0",
    borderRadius: "999px",
    background: "#17263c",
    color: "#fff",
    cursor: "pointer",
    font: "700 13px PingFang SC, -apple-system, BlinkMacSystemFont, Microsoft YaHei, sans-serif",
    padding: "8px 12px",
    boxShadow: "0 8px 24px rgba(20, 35, 44, 0.22)"
  });
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    const term = button.dataset.term || "";
    if (!term) return;
    hideLookupButton();
    void lookupSelectedTerm(term);
  });
  document.body.append(button);
  return button;
}

async function lookupSelectedTerm(term: string) {
  const lookupEventId = crypto.randomUUID();
  showLookupPanel({
    term,
    status: "正在查询..."
  });

  try {
    const response = await lookupAndSaveTermDirectly(term, lookupEventId);
    renderLookupResponse(term, response);
  } catch (error) {
    showLookupPanel({
      term,
      status: getLookupErrorMessage(error),
      isError: true
    });
  }
}

function renderLookupResponse(term: string, response: VocabLookupResponse) {
  if (!response.ok) {
    showLookupPanel({
      term,
      status: response.error,
      isError: true
    });
    return;
  }

  if (!response.result.found) {
    showLookupPanel({
      term,
      status: "暂未找到可靠的在线释义。",
      isError: true
    });
    return;
  }

  showLookupPanel({
    term: response.result.term,
    phonetic: response.result.phonetic || response.result.pronunciation,
    chineseDefinition: response.result.chineseDefinition,
    definition: response.result.definition,
    legalContext: response.result.legalContext,
    sourceLabel: response.result.sourceLabel,
    lookupQuality: response.result.lookupQuality,
    lookupWarning: response.result.lookupWarning,
    status: getLookupPanelStatus(response.saveStatus, response.saveError),
    isError: response.saveStatus === "failed"
  });
}

async function lookupAndSaveTermDirectly(term: string, lookupEventId: string): Promise<VocabLookupResponse> {
  const cleanTerm = term.trim();
  if (!cleanTerm) {
    return { ok: false, error: "没有找到选中的词汇。" };
  }

  const lookup = await requestLocalVocabApi<VocabLookupResult>(
    `/api/vocab/lookup?term=${encodeURIComponent(cleanTerm)}`,
    { timeoutMs: 12000 }
  );

  if (!lookup.found) {
    return {
      ok: true,
      result: lookup,
      saveStatus: "skipped"
    };
  }

  try {
    const saveResult = await requestLocalVocabApi<{ created: boolean }>("/api/vocab/lookup/save-entry", {
      method: "POST",
      body: JSON.stringify({
        ...lookup,
        lookupEvent: {
          eventId: lookupEventId,
          source: "extension-selection",
          occurredAt: new Date().toISOString()
        }
      }),
      timeoutMs: 12000
    });

    return {
      ok: true,
      result: lookup,
      saveStatus: saveResult.created ? "saved" : "alreadySaved"
    };
  } catch (error) {
    return {
      ok: true,
      result: lookup,
      saveStatus: "failed",
      saveError: getLookupErrorMessage(error)
    };
  }
}

async function requestLocalVocabApi<T>(
  path: string,
  options: { method?: string; body?: string; timeoutMs?: number } = {}
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);

  try {
    const response = await fetch(`${vocabApiBaseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body,
      cache: "no-store",
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(typeof payload?.error === "string" ? payload.error : `本地学习服务返回异常（状态码 ${response.status}）。`);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("查询超时。请确认“大王查词”已打开，然后重试。");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function getLookupPanelStatus(saveStatus?: "saved" | "alreadySaved" | "failed" | "skipped", saveError?: string): string {
  if (saveStatus === "saved") return "已加入复习计划";
  if (saveStatus === "alreadySaved") return "已在复习计划中";
  if (saveStatus === "failed") return saveError || "查询完成，但保存失败。";
  return "查询完成";
}

function getLookupErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.toLowerCase().includes("failed to fetch") || message.toLowerCase().includes("networkerror")) {
    return "无法连接本地学习服务。请先打开“大王查词”，然后重试。";
  }
  if (message.toLowerCase().includes("local vocab app is not running")) {
    return "请先打开“大王查词”，然后重试。";
  }
  if (message.toLowerCase().includes("lookup timed out")) {
    return "查询时间过长。请确认“大王查词”已打开，然后重试。";
  }
  if (message.toLowerCase().includes("extension context invalidated")) {
    return "扩展刚刚刷新。请刷新一次当前网页，然后重新选词。";
  }
  return message || "查询失败。请打开“大王查词”后重试。";
}

function showLookupPanel(data: {
  term: string;
  phonetic?: string;
  chineseDefinition?: string;
  definition?: string;
  legalContext?: string;
  lookupQuality?: "oxford" | "cambridge" | "merriam-webster" | "ai-legal" | "legal-glossary" | "saved" | "reference" | "dictionary";
  sourceLabel?: string;
  lookupWarning?: string;
  status: string;
  isError?: boolean;
}) {
  const panel = getOrCreateLookupPanel();
  panel.innerHTML = "";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.gap = "12px";
  header.style.alignItems = "flex-start";

  const titleWrap = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = data.term;
  title.style.display = "block";
  title.style.color = "#17263c";
  title.style.fontSize = "18px";
  titleWrap.append(title);

  if (data.phonetic) {
    const phonetic = document.createElement("span");
    phonetic.textContent = data.phonetic;
    phonetic.style.display = "inline-block";
    phonetic.style.marginTop = "6px";
    phonetic.style.padding = "4px 8px";
    phonetic.style.borderRadius = "999px";
    phonetic.style.background = "#ebe6de";
    phonetic.style.color = "#526073";
    titleWrap.append(phonetic);
  }

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "×";
  Object.assign(closeButton.style, panelIconButtonStyle());
  closeButton.addEventListener("click", hideLookupPanel);

  header.append(titleWrap, closeButton);
  panel.append(header);

  const status = document.createElement("div");
  status.textContent = data.status;
  status.style.marginTop = "12px";
  status.style.padding = "8px 10px";
  status.style.borderRadius = "8px";
  status.style.fontWeight = "800";
  status.style.background = data.isError ? "#fff1ed" : "#eef5ef";
  status.style.color = data.isError ? "#8f3431" : "#365e43";
  panel.append(status);

  if (data.sourceLabel || data.lookupQuality) {
    panel.append(createMetaBlock([
      data.sourceLabel ? formatSourceLabel(data.sourceLabel) : "",
      data.lookupQuality ? formatLookupQuality(data.lookupQuality) : ""
    ].filter(Boolean).join(" · ")));
  }

  if (data.lookupWarning) {
    panel.append(createStatusBlock(formatLookupWarning(data.lookupWarning), false, true));
  }

  if (data.chineseDefinition && data.definition) {
    panel.append(createDefinitionBlock("中文", data.chineseDefinition));
    panel.append(createDefinitionBlock("英文释义", data.definition));
    panel.append(createDefinitionBlock("法律语境", data.legalContext || "普通词，但在法律材料中应结合上下文理解。"));
  } else if (data.definition && !data.isError) {
    panel.append(createStatusBlock("正在整理中英文释义...", false));
  }

  if (data.definition && data.chineseDefinition) {
    const voicePicker = createVoicePicker();
    if (voicePicker) {
      panel.append(voicePicker);
    }

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.marginTop = "12px";

    const speak = document.createElement("button");
    speak.type = "button";
    speak.textContent = "发音";
    Object.assign(speak.style, panelActionButtonStyle());
    speak.addEventListener("click", () => speakText(data.term));
    actions.append(speak);
    panel.append(actions);
  }

  panel.hidden = false;
}

function getOrCreateLookupPanel(): HTMLDivElement {
  const existing = document.getElementById(notebookLookupPanelId);
  if (existing instanceof HTMLDivElement) return existing;

  const panel = document.createElement("div");
  panel.id = notebookLookupPanelId;
  Object.assign(panel.style, {
    position: "fixed",
    right: "18px",
    bottom: "18px",
    zIndex: "2147483647",
    width: "min(380px, calc(100vw - 36px))",
    maxHeight: "min(520px, calc(100vh - 36px))",
    overflow: "auto",
    background: "#fffdf8",
    border: "1px solid #d8d0c4",
    borderRadius: "8px",
    boxShadow: "0 18px 50px rgba(20, 35, 44, 0.24)",
    color: "#27364b",
    font: "14px PingFang SC, -apple-system, BlinkMacSystemFont, Microsoft YaHei, sans-serif",
    padding: "16px"
  });
  document.body.append(panel);
  return panel;
}

function createDefinitionBlock(label: string, text: string): HTMLElement {
  const block = document.createElement("section");
  Object.assign(block.style, {
    marginTop: "12px",
    padding: "10px 12px",
    border: "1px solid #ded7cd",
    borderRadius: "8px",
    background: "#f8f4ed"
  });

  const tag = document.createElement("span");
  tag.textContent = label;
  tag.style.display = "block";
  tag.style.color = "#667085";
  tag.style.fontSize = "12px";
  tag.style.fontWeight = "800";
  tag.style.marginBottom = "6px";
  tag.style.textTransform = "uppercase";

  const body = document.createElement("p");
  body.textContent = text;
  body.style.margin = "0";
  body.style.lineHeight = "1.5";

  block.append(tag, body);
  return block;
}

function createMetaBlock(text: string): HTMLElement {
  const meta = document.createElement("div");
  meta.textContent = text;
  meta.style.display = "inline-block";
  meta.style.marginTop = "10px";
  meta.style.padding = "5px 9px";
  meta.style.borderRadius = "999px";
  meta.style.background = "#ebe6de";
  meta.style.color = "#526073";
  meta.style.fontSize = "12px";
  meta.style.fontWeight = "800";
  return meta;
}

function createStatusBlock(text: string, isError: boolean, isWarning = false): HTMLElement {
  const status = document.createElement("div");
  status.textContent = text;
  status.style.marginTop = "12px";
  status.style.padding = "8px 10px";
  status.style.borderRadius = "8px";
  status.style.fontWeight = "800";
  status.style.background = isError ? "#fff1ed" : isWarning ? "#fff5dd" : "#eef5ef";
  status.style.color = isError ? "#8f3431" : isWarning ? "#765016" : "#365e43";
  return status;
}

function formatLookupQuality(
  quality: "oxford" | "cambridge" | "merriam-webster" | "ai-legal" | "legal-glossary" | "saved" | "reference" | "dictionary"
): string {
  if (quality === "oxford") return "Oxford 标准词典";
  if (quality === "cambridge") return "Cambridge 标准词典";
  if (quality === "merriam-webster") return "Merriam-Webster 标准词典";
  if (quality === "ai-legal") return "AI 法律释义";
  if (quality === "legal-glossary") return "法律词典";
  if (quality === "saved") return "已保存";
  if (quality === "reference") return "参考资料";
  return "备用释义";
}

function formatSourceLabel(label: string): string {
  return {
    "Saved review item": "已保存词条",
    "Fallback dictionary": "备用在线词典",
    "Built-in legal glossary": "法律术语表",
    "Legal glossary": "法律术语表",
    "Reference fallback": "参考资料",
    "AI legal dictionary": "AI 法律词典",
    "Oxford Dictionaries API": "Oxford 标准词典",
    "Cambridge Dictionary API": "Cambridge 标准词典",
    "Merriam-Webster Dictionary API": "Merriam-Webster 标准词典"
  }[label] ?? label;
}

function formatLookupWarning(warning: string): string {
  return {
    "This old entry looks like a reference summary or non-legal result. Review before using it in quizzes.": "这个旧词条可能是参考摘要或非法律释义，请确认后再用于测试。",
    "This old entry was saved before quality tracking. Review its legal meaning before relying on it.": "这个旧词条保存于质量检查启用之前，请确认其法律含义。",
    "This is a fallback definition. Legal meaning may need AI legal lookup.": "当前为备用释义，法律含义可能需要进一步检索确认。",
    "This is a reference summary, not a concise dictionary definition.": "当前内容是参考摘要，并非精炼的词典释义。",
    "未找到 Oxford / Cambridge / Merriam-Webster 标准词典释义；当前为备用释义，请人工确认后再进入正式复习。": "未找到 Oxford / Cambridge / Merriam-Webster 标准词典释义；当前为备用释义，请人工确认后再进入正式复习。",
    "未找到 Oxford / Cambridge / Merriam-Webster 标准词典释义；当前内容是参考摘要，并非精炼的词典释义，请人工确认。": "未找到 Oxford / Cambridge / Merriam-Webster 标准词典释义；当前内容是参考摘要，并非精炼的词典释义，请人工确认。",
    "未找到 Oxford / Cambridge / Merriam-Webster 标准词典释义；当前为 AI 辅助释义，请人工确认。": "未找到 Oxford / Cambridge / Merriam-Webster 标准词典释义；当前为 AI 辅助释义，请人工确认。",
    "未找到 Oxford / Cambridge / Merriam-Webster 标准词典释义；当前为内置法律术语表释义，请人工确认。": "未找到 Oxford / Cambridge / Merriam-Webster 标准词典释义；当前为内置法律术语表释义，请人工确认。"
  }[warning] ?? warning;
}

function createVoicePicker(): HTMLElement | null {
  if (notebookSpeechVoices.length === 0) return null;

  const label = document.createElement("label");
  Object.assign(label.style, {
    alignItems: "center",
    color: "#667085",
    display: "flex",
    gap: "8px",
    marginTop: "12px"
  });

  const labelText = document.createElement("span");
  labelText.textContent = "声音";
  labelText.style.fontSize = "12px";
  labelText.style.fontWeight = "800";

  const select = document.createElement("select");
  Object.assign(select.style, {
    background: "#fffdf8",
    border: "1px solid #cfc6b9",
    borderRadius: "6px",
    color: "#17263c",
    minHeight: "34px",
    maxWidth: "260px",
    padding: "0 8px"
  });

  for (const voice of notebookSpeechVoices) {
    const option = document.createElement("option");
    option.value = voice.voiceURI;
    option.textContent = `${voice.name} (${voice.lang})`;
    select.append(option);
  }

  select.value = selectedNotebookVoiceURI || pickPreferredVoice(notebookSpeechVoices)?.voiceURI || "";
  select.addEventListener("change", () => {
    selectedNotebookVoiceURI = select.value;
  });

  label.append(labelText, select);
  return label;
}

function panelIconButtonStyle(): Partial<CSSStyleDeclaration> {
  return {
    border: "0",
    borderRadius: "6px",
    background: "#ebe6de",
    color: "#17263c",
    cursor: "pointer",
    font: "700 18px PingFang SC, -apple-system, BlinkMacSystemFont, Microsoft YaHei, sans-serif",
    height: "34px",
    width: "34px"
  };
}

function panelActionButtonStyle(): Partial<CSSStyleDeclaration> {
  return {
    border: "0",
    borderRadius: "6px",
    background: "#17263c",
    color: "#fff",
    cursor: "pointer",
    font: "700 14px PingFang SC, -apple-system, BlinkMacSystemFont, Microsoft YaHei, sans-serif",
    minHeight: "38px",
    padding: "0 14px"
  };
}

function getSelectedLookupText(): string {
  const selectedText = window.getSelection()?.toString() ?? "";
  const compact = selectedText
    .replace(/[^\p{L}\s'-]/gu, " ")
    .split(/\s+/)
    .map((part) => part.trim().replace(/^[-']+|[-']+$/g, ""))
    .filter(Boolean)
    .join(" ")
    .trim();
  const wordCount = compact ? compact.split(/\s+/).length : 0;

  if (!compact || compact.length > 80 || wordCount > 8) return "";

  return compact;
}

function hideLookupButton() {
  const button = document.getElementById(notebookLookupButtonId);
  if (button instanceof HTMLButtonElement) {
    button.hidden = true;
  }
}

function hideLookupPanel() {
  const panel = document.getElementById(notebookLookupPanelId);
  if (panel instanceof HTMLDivElement) {
    panel.hidden = true;
  }
}

async function speakText(term: string) {
  if (!("speechSynthesis" in window)) return;
  if (notebookSpeechVoices.length === 0) {
    await waitForNotebookSpeechVoices();
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(term);
  const voice = pickNotebookVoice();
  utterance.lang = voice?.lang || "en-US";
  utterance.voice = voice || null;
  utterance.rate = 0.78;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function loadNotebookSpeechVoices() {
  if (!("speechSynthesis" in window)) return;

  notebookSpeechVoices = window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith("en-"));
  selectedNotebookVoiceURI ||= pickPreferredVoice(notebookSpeechVoices)?.voiceURI || "";
}

async function waitForNotebookSpeechVoices(): Promise<void> {
  loadNotebookSpeechVoices();
  if (notebookSpeechVoices.length > 0) return;

  await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
  loadNotebookSpeechVoices();
}

function pickNotebookVoice(): SpeechSynthesisVoice | undefined {
  const voices = notebookSpeechVoices.length > 0
    ? notebookSpeechVoices
    : window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith("en-"));

  return voices.find((voice) => voice.voiceURI === selectedNotebookVoiceURI)
    ?? pickPreferredVoice(voices);
}

function pickPreferredVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const preferredNames = ["Samantha", "Alex", "Ava", "Daniel", "Karen", "Moira"];
  return preferredNames
    .map((name) => voices.find((voice) => voice.name.toLowerCase().includes(name.toLowerCase())))
    .find(Boolean)
    ?? voices.find((voice) => voice.lang === "en-US" && voice.localService)
    ?? voices.find((voice) => voice.lang === "en-US")
    ?? voices.find((voice) => voice.localService)
    ?? voices[0];
}
