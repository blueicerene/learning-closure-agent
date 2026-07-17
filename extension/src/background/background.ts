import type { CaptureMode, CaptureResponse, GoalTrack } from "../shared/types";

const vocabAppBaseUrl = "http://127.0.0.1:5174/";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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

  if (message?.type === "VOCAB_LOOKUP_SAVE") {
    lookupAndSaveVocab(message.term)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unable to look up vocabulary"
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

async function ensureVocabAppIsRunning() {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 900);
  try {
    const response = await fetch(vocabAppBaseUrl, {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Unexpected response ${response.status}`);
    }
  } catch {
    throw new Error("Local vocab app is not running. Start the web app, then drag the image again.");
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

async function lookupAndSaveVocab(term: unknown) {
  const cleanTerm = typeof term === "string" ? term.trim() : "";
  if (!cleanTerm) {
    throw new Error("No selected term found");
  }

  const lookupResponse = await fetch(`http://localhost:3333/api/vocab/lookup?term=${encodeURIComponent(cleanTerm)}`);
  const lookup = await lookupResponse.json();
  if (!lookupResponse.ok) {
    throw new Error(lookup?.error || "Vocabulary lookup failed");
  }

  if (lookup?.found) {
    try {
      const saveResult = await saveLookupEntry(lookup);
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
        saveError: error instanceof Error ? error.message : "Unable to save vocabulary"
      };
    }
  }

  return {
    ok: true,
    result: lookup,
    saveStatus: "skipped"
  };
}

async function saveLookupEntry(lookup: unknown): Promise<{ created: boolean }> {
  const saveResponse = await fetch("http://localhost:3333/api/vocab/lookup/save-entry", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(lookup)
  });
  const saveResult = await saveResponse.json().catch(() => ({}));
  if (!saveResponse.ok) {
    throw new Error(typeof saveResult?.error === "string" ? saveResult.error : "Vocabulary save failed");
  }
  return { created: Boolean(saveResult?.created) };
}
