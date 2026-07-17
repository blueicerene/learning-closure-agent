import type { CaptureMode, GoalTrack, LearningSession, SourceType } from "../shared/types";

const maxChars = 80_000;
const notebookLookupButtonId = "lca-vocab-lookup-button";
const notebookLookupPanelId = "lca-vocab-lookup-panel";
const imageDropTargetId = "lca-image-drop-target";
let notebookSpeechVoices: SpeechSynthesisVoice[] = [];
let selectedNotebookVoiceURI = "";

type VocabLookupResponse =
  | {
      ok: true;
      result: {
        term: string;
        definition: string;
        chineseDefinition?: string;
        legalContext?: string;
        lookupQuality?: "ai-legal" | "legal-glossary" | "saved" | "reference" | "dictionary";
        sourceLabel?: string;
        lookupWarning?: string;
        phonetic?: string;
        pronunciation?: string;
        found: boolean;
      };
      saveStatus?: "saved" | "alreadySaved" | "failed" | "skipped";
      saveError?: string;
    }
  | {
      ok: false;
      error: string;
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
        error: error instanceof Error ? error.message : "Unable to capture page"
      });
    }

    return true;
  });
}

function captureCurrentPage(mode: CaptureMode, goal?: string, primaryGoalTrack?: GoalTrack, subject?: string): LearningSession {
  const selectedText = window.getSelection()?.toString() || "";
  const rawText = mode === "selection" ? selectedText : extractReadableText();

  if (!rawText.trim()) {
    throw new Error(mode === "selection" ? "No selected text found on the page" : "No readable text found on the page");
  }

  return {
    id: crypto.randomUUID(),
    goal: typeof goal === "string" && goal.trim() ? goal.trim() : undefined,
    primaryGoalTrack: primaryGoalTrack ?? "LLM",
    subject: subject || "Canadian Constitutional Law",
    sourceType: detectSourceType(window.location.hostname, window.location.href),
    title: document.title || "Untitled page",
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
      name: typeof payload.name === "string" ? payload.name : "dropped-image.png",
      mimeType: typeof payload.mimeType === "string" ? payload.mimeType : "image/png",
      dataUrl: payload.dataUrl
    }, window.location.origin);

    await chrome.storage.local.remove(imageKey);
  } catch {
    window.postMessage({
      type: "LCA_IMAGE_WORD_LOOKUP_ERROR",
      message: "Unable to load dropped image. Try dragging it again."
    }, window.location.origin);
  }
}

function getOrCreateImageDropTarget(): HTMLDivElement {
  const existing = document.getElementById(imageDropTargetId);
  if (existing instanceof HTMLDivElement) return existing;

  const target = document.createElement("div");
  target.id = imageDropTargetId;
  target.title = "Drop word image to open Legal English Vocab";
  target.textContent = "IMG";
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
    font: "800 12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
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
  target.textContent = active ? "DROP" : "IMG";
  target.style.background = active ? "#16704a" : "#214c5f";
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
    if (!response?.ok) throw new Error(response?.error || "Unable to open vocab app");
  } catch (error) {
    target.textContent = "ERR";
    window.setTimeout(() => setImageDropTargetActive(target, false), 1400);
    showLookupPanel({
      term: file.name || "image",
      status: error instanceof Error ? error.message : "Unable to open image lookup.",
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
    reader.addEventListener("error", () => reject(new Error("Unable to read image file")));
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
  button.textContent = "Look up";
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
    background: "#214c5f",
    color: "#fff",
    cursor: "pointer",
    font: "700 13px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
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
  showLookupPanel({
    term,
    status: "Looking up..."
  });

  let response: VocabLookupResponse;
  try {
    response = await withTimeout(
      chrome.runtime.sendMessage({
        type: "VOCAB_LOOKUP_SAVE",
        term
      }) as Promise<VocabLookupResponse>,
      12000
    );
  } catch (error) {
    showLookupPanel({
      term,
      status: getLookupErrorMessage(error),
      isError: true
    });
    return;
  }

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
      status: "No online dictionary result found.",
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

function getLookupPanelStatus(saveStatus?: "saved" | "alreadySaved" | "failed" | "skipped", saveError?: string): string {
  if (saveStatus === "saved") return "Saved for tomorrow";
  if (saveStatus === "alreadySaved") return "Already in review";
  if (saveStatus === "failed") return saveError || "Looked up, but save failed.";
  return "Looked up";
}

function getLookupErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.toLowerCase().includes("extension context invalidated")) {
    return "Extension was reloaded. Refresh this page, then select the term again.";
  }
  return message || "Extension lookup failed. Reload the extension and refresh this page.";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Lookup is taking longer than expected. Try again in a moment.")), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function showLookupPanel(data: {
  term: string;
  phonetic?: string;
  chineseDefinition?: string;
  definition?: string;
  legalContext?: string;
  lookupQuality?: "ai-legal" | "legal-glossary" | "saved" | "reference" | "dictionary";
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
  title.style.color = "#172832";
  title.style.fontSize = "18px";
  titleWrap.append(title);

  if (data.phonetic) {
    const phonetic = document.createElement("span");
    phonetic.textContent = data.phonetic;
    phonetic.style.display = "inline-block";
    phonetic.style.marginTop = "6px";
    phonetic.style.padding = "4px 8px";
    phonetic.style.borderRadius = "999px";
    phonetic.style.background = "#edf3f5";
    phonetic.style.color = "#405662";
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
  status.style.background = data.isError ? "#f8e4df" : "#d9eadf";
  status.style.color = data.isError ? "#8b2f1d" : "#22513a";
  panel.append(status);

  if (data.sourceLabel || data.lookupQuality) {
    panel.append(createMetaBlock([
      data.sourceLabel,
      data.lookupQuality ? formatLookupQuality(data.lookupQuality) : ""
    ].filter(Boolean).join(" · ")));
  }

  if (data.lookupWarning) {
    panel.append(createStatusBlock(data.lookupWarning, false, true));
  }

  if (data.chineseDefinition && data.definition) {
    panel.append(createDefinitionBlock("中文", data.chineseDefinition));
    panel.append(createDefinitionBlock("English", data.definition));
    panel.append(createDefinitionBlock("Legal context", data.legalContext || "普通词，但在法律材料中应结合上下文理解。"));
  } else if (data.definition && !data.isError) {
    panel.append(createStatusBlock("Preparing Chinese and English definitions...", false));
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
    speak.textContent = "Speak";
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
    background: "#fff",
    border: "1px solid #d8e0e4",
    borderRadius: "10px",
    boxShadow: "0 18px 50px rgba(20, 35, 44, 0.24)",
    color: "#23323a",
    font: "14px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
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
    border: "1px solid #d8e0e4",
    borderRadius: "8px",
    background: "#f7f9fa"
  });

  const tag = document.createElement("span");
  tag.textContent = label;
  tag.style.display = "block";
  tag.style.color = "#60707a";
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
  meta.style.background = "#edf3f5";
  meta.style.color = "#405662";
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
  status.style.background = isError ? "#f8e4df" : isWarning ? "#fff3d6" : "#d9eadf";
  status.style.color = isError ? "#8b2f1d" : isWarning ? "#6b4b00" : "#22513a";
  return status;
}

function formatLookupQuality(quality: "ai-legal" | "legal-glossary" | "saved" | "reference" | "dictionary"): string {
  if (quality === "ai-legal") return "AI legal";
  if (quality === "legal-glossary") return "Legal glossary";
  if (quality === "saved") return "Saved";
  if (quality === "reference") return "Reference";
  return "Fallback";
}

function createVoicePicker(): HTMLElement | null {
  if (notebookSpeechVoices.length === 0) return null;

  const label = document.createElement("label");
  Object.assign(label.style, {
    alignItems: "center",
    color: "#59666f",
    display: "flex",
    gap: "8px",
    marginTop: "12px"
  });

  const labelText = document.createElement("span");
  labelText.textContent = "Voice";
  labelText.style.fontSize = "12px";
  labelText.style.fontWeight = "800";

  const select = document.createElement("select");
  Object.assign(select.style, {
    background: "#fff",
    border: "1px solid #cbd5db",
    borderRadius: "6px",
    color: "#1f2933",
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
    background: "#dde5e9",
    color: "#21323b",
    cursor: "pointer",
    font: "800 18px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    height: "34px",
    width: "34px"
  };
}

function panelActionButtonStyle(): Partial<CSSStyleDeclaration> {
  return {
    border: "0",
    borderRadius: "6px",
    background: "#214c5f",
    color: "#fff",
    cursor: "pointer",
    font: "800 14px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
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
