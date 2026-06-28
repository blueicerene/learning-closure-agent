import type { CaptureMode, GoalTrack, LearningSession, SourceType } from "../shared/types";

const maxChars = 80_000;

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
