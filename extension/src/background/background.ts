import type { CaptureMode, CaptureResponse, GoalTrack } from "../shared/types";

const vocabAppBaseUrl = "http://127.0.0.1:5174/";
const vocabSelectionMenuId = "lca-vocab-lookup-selection";
const vocabReviewMenuId = "lca-vocab-open-review";

chrome.runtime.onInstalled.addListener(() => {
  installContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  installContextMenus();
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === vocabReviewMenuId) {
    openTodayReview().catch(() => undefined);
    return;
  }
  if (info.menuItemId !== vocabSelectionMenuId) return;

  const selectedText = normalizeLookupText(info.selectionText || "");
  if (!selectedText) return;

  openLookupTerm(selectedText).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "VOCAB_OPEN_TODAY_REVIEW") {
    openTodayReview()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unable to open today review"
      }));
    return true;
  }

  if (message?.type === "VOCAB_OPEN_IMAGE_LOOKUP") {
    openImageLookup(message)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unable to open image lookup"
        });
      });

    return true;
  }

  if (message?.type !== "REQUEST_CAPTURE") {
    return false;
  }

  captureActiveTab(message.mode ?? "page", message.goal, message.primaryGoalTrack, message.subject)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unable to capture active tab"
      } satisfies CaptureResponse);
    });

  return true;
});

function installContextMenus() {
  chrome.contextMenus.remove(vocabSelectionMenuId, () => {
    chrome.runtime.lastError;
    chrome.contextMenus.create({
      id: vocabSelectionMenuId,
      title: "大王查词：%s",
      contexts: ["selection"]
    });
  });
  chrome.contextMenus.remove(vocabReviewMenuId, () => {
    chrome.runtime.lastError;
    chrome.contextMenus.create({
      id: vocabReviewMenuId,
      title: "大王：开始今日复习",
      contexts: ["page", "selection"]
    });
  });
}

async function openImageLookup(message: unknown): Promise<{ ok: true; key: string }> {
  const payload = message as { name?: unknown; mimeType?: unknown; dataUrl?: unknown };
  const dataUrl = typeof payload.dataUrl === "string" ? payload.dataUrl : "";
  if (!dataUrl.startsWith("data:image/")) {
    throw new Error("Drop an image file.");
  }

  const key = `lca-image-lookup-${Date.now()}-${crypto.randomUUID()}`;
  await chrome.storage.local.set({
    [key]: {
      name: typeof payload.name === "string" ? payload.name : "dropped-image.png",
      mimeType: typeof payload.mimeType === "string" ? payload.mimeType : "image/png",
      dataUrl
    }
  });

  await ensureVocabAppIsRunning();
  await openOrReuseVocabAppTab(`${vocabAppBaseUrl}?imageLookup=${encodeURIComponent(key)}`);

  return { ok: true, key };
}

async function openLookupTerm(term: string) {
  await ensureVocabAppIsRunning();
  await openOrReuseVocabAppTab(`${vocabAppBaseUrl}?term=${encodeURIComponent(term)}&autoLookup=1`);
}

async function openTodayReview() {
  await ensureVocabAppIsRunning();
  await openOrReuseVocabAppTab(`${vocabAppBaseUrl}?view=quiz`);
}

async function ensureVocabAppIsRunning() {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 1200);
  try {
    const responses = await Promise.all([
      fetch(vocabAppBaseUrl, { cache: "no-store", signal: controller.signal }),
      fetch("http://127.0.0.1:3333/health", { cache: "no-store", signal: controller.signal })
    ]);
    if (responses.some((response) => !response.ok)) {
      throw new Error("Unexpected local service response");
    }
  } catch {
    throw new Error("大王查词 is not running. Double-click 大王查词 on the Desktop, then try again.");
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function openOrReuseVocabAppTab(url: string) {
  const tabs = await chrome.tabs.query({
    url: [
      "http://127.0.0.1:5174/*",
      "http://localhost:5174/*"
    ]
  });
  const existingTab = tabs.find((tab) => typeof tab.id === "number");
  if (!existingTab?.id) {
    await chrome.tabs.create({ url });
    return;
  }

  await chrome.tabs.update(existingTab.id, { active: true, url });
  if (typeof existingTab.windowId === "number") {
    await chrome.windows.update(existingTab.windowId, { focused: true });
  }
}

function normalizeLookupText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[“”"']/g, "")
    .replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "")
    .trim()
    .slice(0, 80);
}

async function captureActiveTab(mode: CaptureMode, goal?: string, primaryGoalTrack?: GoalTrack, subject?: string): Promise<CaptureResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) {
    throw new Error("No active tab found");
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["assets/contentScript.js"]
  });

  return await chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_CURRENT_PAGE", mode, goal, primaryGoalTrack, subject });
}
