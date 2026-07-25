import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { recognize } from "tesseract.js";
import "./styles.css";

type ReviewStatus = "new" | "learning" | "review" | "mastered";
type ReviewResult = "correct" | "wrong";

type ReviewState = {
  status: ReviewStatus;
  correctStreak: number;
  wrongCount: number;
  memoryStrength?: number;
  easeFactor?: number;
  lastIntervalDays?: number;
  retentionTarget?: number;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  lastResult?: ReviewResult;
};

type VocabItem = {
  id: string;
  term: string;
  definition: string;
  chineseDefinition?: string;
  legalContext?: string;
  lookupQuality?: "ai-legal" | "legal-glossary" | "saved" | "reference" | "dictionary";
  sourceLabel?: string;
  lookupWarning?: string;
  phonetic?: string;
  pronunciation?: string;
  legalNote?: LegalEnglishNote;
  sourceText: string;
  createdAt: string;
  updatedAt: string;
  reviewState: ReviewState;
};

type VocabStats = {
  total: number;
  dueToday: number;
  tomorrow: number;
  wrong: number;
  learning: number;
  reviewed: number;
  mastered: number;
  needsReview: number;
};

type ItemsResponse = {
  items: VocabItem[];
  stats: VocabStats;
};

type LearningStatus = {
  generatedAt: string;
  todayAdded: number;
  dueToday: number;
  learningStreakDays: number;
  masteryRate: number;
  mastered: number;
  total: number;
  repeatedWrong: number;
  petState: "idle" | "due" | "encourage" | "focus";
  message: string;
  reviewUrl: string;
};

type ImportFailure = {
  line: number;
  text: string;
  reason: string;
};

type ImportResult = {
  imported: number;
  updated: number;
  failed: ImportFailure[];
  items: VocabItem[];
};

type ReviewQuestion = {
  itemId: string;
  term: string;
  correctDefinition: string;
  options: string[];
  reviewState: ReviewState;
};

type ReviewResponse = {
  date: string;
  canStart: boolean;
  reason?: string;
  questions: ReviewQuestion[];
};

type DictionaryResult = {
  term: string;
  definition: string;
  chineseDefinition?: string;
  legalContext?: string;
  lookupQuality?: "ai-legal" | "legal-glossary" | "saved" | "reference" | "dictionary";
  sourceLabel?: string;
  lookupWarning?: string;
  phonetic?: string;
  pronunciation?: string;
  audioUrl?: string;
  legalNote?: LegalEnglishNote;
  found: boolean;
  source: "online";
};

type SaveLookupResult = {
  item: VocabItem;
  created: boolean;
};

type QualityBackfillResult = {
  scanned: number;
  updated: number;
  needsReview: number;
  legalGlossary: number;
  saved: number;
};

type QualityActionResult = {
  item: VocabItem;
  action: "marked-ok" | "rechecked" | "updated";
};

type EditDraft = {
  term: string;
  definition: string;
  chineseDefinition: string;
  legalContext: string;
  phonetic: string;
  pronunciation: string;
};

type LegalEnglishNote = {
  chineseMeaning: string;
  legalRegister: string;
  contextExplanation: string;
  pattern?: string;
  examples: {
    sentence: string;
    translation: string;
  }[];
  comparison?: {
    term: string;
    meaning: string;
    usage: string;
  }[];
};

type Tab = "dictionary" | "quiz" | "import" | "library";
type QuizMode = "due" | "all" | "wrong";
type LibraryFilter = "needsReview" | "tomorrow" | "wrong" | "learning" | "mastered" | "all";
type AnswerFeedback = {
  isCorrect: boolean;
  selectedDefinition: string;
  correctDefinition: string;
};

const apiBaseUrl = "http://localhost:3333";
const sampleText = `estoppel - A rule preventing a person from denying something they previously represented when another person relied on it.
fiduciary duty - A duty to act loyally and in good faith for another person's interests.
injunction - A court order requiring a person to do or stop doing a specific act.
consideration - Something of value exchanged between parties to form a binding contract.`;

function App() {
  const [tab, setTab] = useState<Tab>("dictionary");
  const [items, setItems] = useState<VocabItem[]>([]);
  const [stats, setStats] = useState<VocabStats>({ total: 0, dueToday: 0, tomorrow: 0, wrong: 0, learning: 0, reviewed: 0, mastered: 0, needsReview: 0 });
  const [learningStatus, setLearningStatus] = useState<LearningStatus>({
    generatedAt: "",
    todayAdded: 0,
    dueToday: 0,
    learningStreakDays: 0,
    masteryRate: 0,
    mastered: 0,
    total: 0,
    repeatedWrong: 0,
    petState: "idle",
    message: "Ready",
    reviewUrl: "http://127.0.0.1:5174/"
  });
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [quizMode, setQuizMode] = useState<QuizMode>("due");
  const [quizComplete, setQuizComplete] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("tomorrow");
  const [lookupTerm, setLookupTerm] = useState("");
  const [dictionaryResult, setDictionaryResult] = useState<DictionaryResult | null>(null);
  const [dictionaryResultQuery, setDictionaryResultQuery] = useState("");
  const [savedLookupItem, setSavedLookupItem] = useState<VocabItem | null>(null);
  const [savedLookupCreated, setSavedLookupCreated] = useState(false);
  const [ocrStatus, setOcrStatus] = useState("");
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [qualityBackfill, setQualityBackfill] = useState<QualityBackfillResult | null>(null);
  const [editingItemId, setEditingItemId] = useState("");
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [speechVoices, setSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;

    const loadVoices = () => {
      const englishVoices = window.speechSynthesis
        .getVoices()
        .filter((voice) => voice.lang.toLowerCase().startsWith("en-"));
      setSpeechVoices(englishVoices);
      setSelectedVoiceURI((current) => current || pickPreferredVoice(englishVoices)?.voiceURI || "");
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  useEffect(() => {
    const handleImageLookupMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const payload = event.data as { type?: string; name?: string; mimeType?: string; dataUrl?: string; message?: string };

      if (payload?.type === "LCA_IMAGE_WORD_LOOKUP_ERROR") {
        setError(payload.message || "Unable to load dropped image.");
        return;
      }

      if (payload?.type !== "LCA_IMAGE_WORD_LOOKUP" || typeof payload.dataUrl !== "string") return;
      try {
        const file = dataUrlToFile(payload.dataUrl, payload.name || "dropped-image.png", payload.mimeType || "image/png");
        setTab("dictionary");
        void recognizeImage(file);
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (err) {
        showError(err);
      }
    };

    window.addEventListener("message", handleImageLookupMessage);
    return () => window.removeEventListener("message", handleImageLookupMessage);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("imageLookup") || params.get("desktopImageLookup")) return;

    if (params.get("view") === "quiz") {
      setTab("quiz");
      return;
    }

    const term = (params.get("term") || params.get("lookupTerm") || "").trim();
    if (!term) return;

    setTab("dictionary");
    setLookupTerm(term);
    void lookupDictionary(term);
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const imageKey = params.get("desktopImageLookup");
    if (!imageKey) return;

    let cancelled = false;
    const loadDesktopImage = async () => {
      try {
        const payload = await request<{ name?: string; mimeType?: string; dataUrl: string }>(
          `/api/vocab/image-lookup/${encodeURIComponent(imageKey)}`
        );
        if (cancelled) return;

        const file = dataUrlToFile(payload.dataUrl, payload.name || "desktop-image.png", payload.mimeType || "image/png");
        setTab("dictionary");
        void recognizeImage(file);
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (err) {
        if (!cancelled) showError(err);
      }
    };

    void loadDesktopImage();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentQuestion = review?.questions[questionIndex] ?? null;
  const testedCount = review ? Math.min(questionIndex + (feedback ? 1 : 0), review.questions.length) : 0;
  const activeDictionaryResult = dictionaryResult && normalizeLookupKey(dictionaryResultQuery) === normalizeLookupKey(lookupTerm)
    ? dictionaryResult
    : null;

  useEffect(() => {
    if (!activeDictionaryResult?.found || activeDictionaryResult.chineseDefinition) return;

    let cancelled = false;
    const term = activeDictionaryResult.term;
    void request<DictionaryResult>(`/api/vocab/lookup?term=${encodeURIComponent(term)}&refresh=${Date.now()}`)
      .then((result) => {
        if (cancelled || !result.chineseDefinition) return;
        setDictionaryResult((current) => current && normalizeLookupKey(current.term) === normalizeLookupKey(term)
          ? { ...current, chineseDefinition: result.chineseDefinition }
          : current);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeDictionaryResult?.term, activeDictionaryResult?.found, activeDictionaryResult?.chineseDefinition]);

  const visibleItems = useMemo(() => {
    return items.filter((item) => matchesLibraryFilter(item, libraryFilter)).sort((a, b) => {
      const statusOrder = statusRank(a.reviewState.status) - statusRank(b.reviewState.status);
      const reviewDateOrder = (a.reviewState.nextReviewAt || "").localeCompare(b.reviewState.nextReviewAt || "");
      return statusOrder || reviewDateOrder || a.term.localeCompare(b.term);
    });
  }, [items, libraryFilter]);
  const libraryCounts = useMemo(() => getLibraryCounts(items), [items]);

  async function refreshAll() {
    setError("");
    await Promise.all([loadItems(), loadReview(), loadLearningStatus()]);
  }

  async function loadItems() {
    try {
      const data = await request<ItemsResponse>("/api/vocab/items");
      setItems(data.items);
      setStats(data.stats);
    } catch (err) {
      showError(err);
    }
  }

  async function loadReview(mode: QuizMode = "due") {
    try {
      const modeQuery = mode === "due" ? "" : `&mode=${mode}`;
      const data = await request<ReviewResponse>(`/api/vocab/review?date=${todayKey()}${modeQuery}`);
      setQuizMode(mode);
      setReview(data);
      setQuestionIndex(0);
      setFeedback(null);
      setQuizComplete(false);
      setStatus(quizStatus(mode));
    } catch (err) {
      showError(err);
    }
  }

  async function loadLearningStatus() {
    try {
      setLearningStatus(await request<LearningStatus>("/api/vocab/learning-status"));
    } catch (err) {
      showError(err);
    }
  }

  async function importVocabulary() {
    const text = importText.trim();
    if (!text) {
      setError("Paste vocabulary text first.");
      return;
    }

    setStatus("Importing");
    setError("");
    setImportResult(null);

    try {
      const result = await request<ImportResult>("/api/vocab/import", {
        method: "POST",
        body: JSON.stringify({ text })
      });
      setImportResult(result);
      setStatus("Import complete");
      await refreshAll();
    } catch (err) {
      showError(err);
      setStatus("Needs attention");
    }
  }

  async function lookupDictionary(termOverride?: string) {
    const term = (termOverride ?? lookupTerm).trim();
    if (!term) {
      setError("Enter a legal term first.");
      return;
    }

    setLookupTerm(term);
    setStatus("Looking up");
    setError("");
    setDictionaryResult(null);
    setDictionaryResultQuery("");
    setSavedLookupItem(null);
    setSavedLookupCreated(false);

    try {
      const result = await request<DictionaryResult>(`/api/vocab/lookup?term=${encodeURIComponent(term)}`);
      setDictionaryResult(result);
      setDictionaryResultQuery(term);
      if (result.found) {
        setStatus("Dictionary result");
        void saveLookupResult(result)
          .then(async (savedResult) => {
            const savedItem = savedResult.item;
            if (savedItem.chineseDefinition && !result.chineseDefinition) {
              setDictionaryResult((current) => current && normalizeLookupKey(current.term) === normalizeLookupKey(result.term)
                ? { ...current, chineseDefinition: savedItem.chineseDefinition, legalContext: savedItem.legalContext || current.legalContext }
                : current);
            }
            setSavedLookupItem(savedItem);
            setSavedLookupCreated(savedResult.created);
            setStatus(savedResult.created ? "Saved for tomorrow" : "Already in review");
            await refreshAll();
          })
          .catch(showError);
      } else {
        setStatus("Not found");
      }
    } catch (err) {
      showError(err);
      setStatus("Needs attention");
    }
  }

  async function saveLookupResult(result: DictionaryResult) {
    return request<SaveLookupResult>("/api/vocab/lookup/save-entry", {
      method: "POST",
      body: JSON.stringify(result)
    });
  }

  async function removeSavedLookup(label: "Undo" | "Ignore") {
    if (!savedLookupItem) return;
    if (!savedLookupCreated) {
      setSavedLookupItem(null);
      setStatus("Kept existing review item");
      return;
    }

    try {
      await request<{ deleted: boolean }>(`/api/vocab/items/${encodeURIComponent(savedLookupItem.id)}`, {
        method: "DELETE"
      });
      setSavedLookupItem(null);
      setSavedLookupCreated(false);
      setStatus(label === "Undo" ? "Save undone" : "Ignored");
      await refreshAll();
    } catch (err) {
      showError(err);
    }
  }

  async function backfillQuality() {
    setError("");
    setQualityBackfill(null);
    try {
      const result = await request<QualityBackfillResult>("/api/vocab/quality/backfill", {
        method: "POST"
      });
      setQualityBackfill(result);
      setLibraryFilter("needsReview");
      setStatus(`Quality backfill updated ${result.updated} items`);
      await loadItems();
    } catch (err) {
      showError(err);
    }
  }

  async function markQualityOk(item: VocabItem) {
    setError("");
    try {
      await request<QualityActionResult>(`/api/vocab/items/${encodeURIComponent(item.id)}/quality-ok`, {
        method: "POST"
      });
      setStatus(`Marked ${item.term} as confirmed`);
      await loadItems();
    } catch (err) {
      showError(err);
    }
  }

  async function recheckItem(item: VocabItem) {
    setError("");
    try {
      await request<QualityActionResult>(`/api/vocab/items/${encodeURIComponent(item.id)}/recheck`, {
        method: "POST"
      });
      setStatus(`Rechecked ${item.term}`);
      await loadItems();
    } catch (err) {
      showError(err);
    }
  }

  async function deleteLibraryItem(item: VocabItem) {
    setError("");
    try {
      await request<{ deleted: boolean }>(`/api/vocab/items/${encodeURIComponent(item.id)}`, {
        method: "DELETE"
      });
      setStatus(`Deleted ${item.term}`);
      await loadItems();
    } catch (err) {
      showError(err);
    }
  }

  function startEditingItem(item: VocabItem) {
    setEditingItemId(item.id);
    setEditDraft({
      term: item.term,
      definition: item.definition,
      chineseDefinition: item.chineseDefinition || "",
      legalContext: item.legalContext || "",
      phonetic: item.phonetic || "",
      pronunciation: item.pronunciation || ""
    });
  }

  function cancelEditingItem() {
    setEditingItemId("");
    setEditDraft(null);
  }

  async function saveEditedItem(item: VocabItem) {
    if (!editDraft) return;
    setError("");
    try {
      await request<QualityActionResult>(`/api/vocab/items/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        body: JSON.stringify(editDraft)
      });
      setStatus(`Updated ${editDraft.term}`);
      cancelEditingItem();
      await loadItems();
    } catch (err) {
      showError(err);
    }
  }

  async function recognizeImage(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Drop an image file onto the dictionary input.");
      return;
    }

    setError("");
    setDictionaryResult(null);
    setSavedLookupItem(null);
    setOcrStatus("Recognizing image");
    setStatus("Recognizing image");

    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    const previewUrl = URL.createObjectURL(file);
    setImagePreviewUrl(previewUrl);

    try {
      const result = await recognize(file, "eng");
      const text = normalizeOcrText(result.data.text);
      if (!text) {
        setOcrStatus("No clear word found");
        setStatus("Needs attention");
        setError("No clear English word was found in the image.");
        return;
      }

      setLookupTerm(text);
      setDictionaryResult(null);
      setDictionaryResultQuery("");
      setSavedLookupItem(null);
      setOcrStatus(`Recognized: ${text}`);
      setStatus("Image recognized, looking up");
      await lookupDictionary(text);
    } catch (err) {
      showError(err);
      setOcrStatus("OCR failed");
      setStatus("Needs attention");
    }
  }

  function handleImageDrop(event: React.DragEvent<HTMLInputElement>) {
    event.preventDefault();
    setIsDraggingImage(false);
    void recognizeImage(event.dataTransfer.files[0] ?? null);
  }

  function handleDefinitionSelection() {
    const selectedText = window.getSelection()?.toString() ?? "";
    const selectedTerm = normalizeSelectedLookupText(selectedText);
    if (!selectedTerm) return;

    void lookupDictionary(selectedTerm);
  }

  async function chooseAnswer(option: string) {
    if (!currentQuestion || feedback) return;

    const isCorrect = option === currentQuestion.correctDefinition;
    setFeedback({
      isCorrect,
      selectedDefinition: option,
      correctDefinition: currentQuestion.correctDefinition
    });

    try {
      await request<VocabItem>("/api/vocab/answer", {
        method: "POST",
        body: JSON.stringify({
          itemId: currentQuestion.itemId,
          selectedDefinition: option,
          correctDefinition: currentQuestion.correctDefinition,
          isCorrect
        })
      });
      await Promise.all([loadItems(), loadLearningStatus()]);
    } catch (err) {
      showError(err);
    }
  }

  async function nextQuestion() {
    if (!review) return;

    if (questionIndex + 1 >= review.questions.length) {
      setStatus("Review complete");
      setQuizComplete(true);
      return;
    }

    setQuestionIndex((value) => value + 1);
    setFeedback(null);
  }

  function showError(err: unknown) {
    setError(err instanceof Error ? err.message : "Something went wrong");
  }

  function speakTerm(term: string) {
    speakWithBrowserVoice(term);
  }

  function speakWithBrowserVoice(term: string) {
    if (!("speechSynthesis" in window)) {
      setError("Speech is not available in this browser.");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(term);
    const voice = pickEnglishVoice();
    utterance.lang = voice?.lang || "en-US";
    utterance.rate = 0.78;
    utterance.pitch = 1;
    utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  }

  function pickEnglishVoice() {
    const voices = speechVoices.length > 0
      ? speechVoices
      : window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith("en-"));

    return voices.find((voice) => voice.voiceURI === selectedVoiceURI)
      ?? pickPreferredVoice(voices)
      ?? null;
  }

  return (
    <main className="app-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">Local Legal English</p>
          <h1>Legal English Review</h1>
        </div>
        <div className="status-pill">{status}</div>
      </header>

      <section className="stats-grid" aria-label="Vocabulary stats">
        <Stat label="Added today" value={learningStatus.todayAdded} />
        <Stat label="Due today" value={learningStatus.dueToday} />
        <Stat label="Learning streak" value={`${learningStatus.learningStreakDays}d`} />
        <Stat label="Legal mastery" value={`${learningStatus.masteryRate}%`} />
      </section>
      {learningStatus.repeatedWrong > 0 && (
        <button className="review-nudge" onClick={() => {
          setTab("quiz");
          void loadReview("wrong");
        }}>
          大王提醒：有 {learningStatus.repeatedWrong} 个词需要重点复习
        </button>
      )}

      <nav className="tabs" aria-label="Views">
        <button className={tab === "dictionary" ? "active" : ""} onClick={() => setTab("dictionary")}>Dictionary</button>
        <button className={tab === "quiz" ? "active" : ""} onClick={() => setTab("quiz")}>Today Practice</button>
        <button className={tab === "import" ? "active" : ""} onClick={() => setTab("import")}>Import</button>
        <button className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}>Library</button>
      </nav>

      {error && <div className="notice error">{error}</div>}

      {tab === "dictionary" && (
        <section className="workspace">
          <div className="section-head">
            <div>
              <h2>Dictionary</h2>
              <p>Look up legal English, listen, and add it to review.</p>
            </div>
          </div>

          <div className="lookup-row">
            <input
              className={`lookup-input ${isDraggingImage ? "dragging" : ""}`}
              value={lookupTerm}
              onChange={(event) => {
                setLookupTerm(event.target.value);
                setDictionaryResult(null);
                setDictionaryResultQuery("");
                setSavedLookupItem(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void lookupDictionary();
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDraggingImage(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDraggingImage(true);
              }}
              onDragLeave={() => setIsDraggingImage(false)}
              onDrop={handleImageDrop}
              placeholder="promulgated"
            />
            <button onClick={() => void lookupDictionary()}>Look Up</button>
          </div>

          <div className="image-lookup">
            <label className="image-upload">
              <span>Image Word Lookup</span>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => void recognizeImage(event.target.files?.[0] ?? null)}
              />
            </label>
            {ocrStatus && <p>{ocrStatus}</p>}
            {imagePreviewUrl && <img src={imagePreviewUrl} alt="Uploaded word preview" />}
          </div>

          {activeDictionaryResult && (
            <article className="dictionary-card">
              <div className="dictionary-title">
                <div>
                  <h3>{activeDictionaryResult.term}</h3>
                  <PronunciationLabels result={activeDictionaryResult} />
                </div>
                <button className="secondary" onClick={() => speakTerm(activeDictionaryResult.term)}>Speak</button>
              </div>
              {activeDictionaryResult.found ? (
                <>
                  <div className="question-meta">
                    <span>{activeDictionaryResult.sourceLabel || "legal English lookup"}</span>
                    {activeDictionaryResult.lookupQuality && <span>{formatLookupQuality(activeDictionaryResult.lookupQuality)}</span>}
                    {activeDictionaryResult.legalNote && <span>legal English note</span>}
                  </div>
                  {activeDictionaryResult.lookupWarning && (
                    <div className="notice warning">{activeDictionaryResult.lookupWarning}</div>
                  )}
                  {speechVoices.length > 0 && (
                    <label className="voice-picker">
                      <span>Voice</span>
                      <select value={selectedVoiceURI} onChange={(event) => setSelectedVoiceURI(event.target.value)}>
                        {speechVoices.map((voice) => (
                          <option key={voice.voiceURI} value={voice.voiceURI}>
                            {voice.name} ({voice.lang})
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {activeDictionaryResult.chineseDefinition ? (
                    <>
                      <section className="bilingual-definition">
                        <span>中文</span>
                        <p>{activeDictionaryResult.chineseDefinition}</p>
                      </section>
                      <section className="bilingual-definition english">
                        <span>English</span>
                        <p
                          className="definition-text"
                          onMouseUp={handleDefinitionSelection}
                          onTouchEnd={handleDefinitionSelection}
                        >
                          {activeDictionaryResult.definition}
                        </p>
                      </section>
                      <section className="bilingual-definition context">
                        <span>Legal context</span>
                        <p>{activeDictionaryResult.legalContext || activeDictionaryResult.legalNote?.contextExplanation || "普通词，但在法律材料中应结合上下文理解。"}</p>
                      </section>
                      {activeDictionaryResult.legalNote && <LegalNotePanel note={activeDictionaryResult.legalNote} />}
                      <div className="quiz-actions">
                        <span className="saved-pill">{savedLookupItem ? (savedLookupCreated ? "Saved" : "Already saved") : "Saving"}</span>
                        <button className="secondary" onClick={() => speakTerm(activeDictionaryResult.term)}>Speak Again</button>
                        <button className="secondary" onClick={() => void removeSavedLookup("Undo")} disabled={!savedLookupItem || !savedLookupCreated}>Undo</button>
                        <button className="secondary" onClick={() => void removeSavedLookup("Ignore")} disabled={!savedLookupItem || !savedLookupCreated}>Ignore</button>
                      </div>
                    </>
                  ) : (
                    <div className="notice bilingual-loading">Preparing Chinese and English definitions...</div>
                  )}
                </>
              ) : (
                <div className="notice error">No online dictionary result found.</div>
              )}
            </article>
          )}
        </section>
      )}

      {tab === "quiz" && (
        <section className="workspace">
          <div className="section-head">
            <div>
              <h2>{quizTitle(quizMode)}</h2>
              <p>{review ? `${testedCount}/${review.questions.length} reviewed for ${review.date}` : "Loading"}</p>
            </div>
            <div className="quiz-actions">
              <button className={quizMode === "due" ? "" : "secondary"} onClick={() => void loadReview("due")}>Due Review</button>
              <button className={quizMode === "wrong" ? "" : "secondary"} onClick={() => void loadReview("wrong")} disabled={items.length < 4 || stats.wrong === 0}>Wrong Queue</button>
              <button className={quizMode === "all" ? "" : "secondary"} onClick={() => void loadReview("all")} disabled={items.length < 4}>Today Practice</button>
            </div>
          </div>

          {quizComplete && review?.canStart && (
            <div className="empty-state">
              <h3>Review complete</h3>
              <p>You can restart this set or switch review mode.</p>
              <div className="quiz-actions">
                <button onClick={() => void loadReview(quizMode)}>Restart</button>
                <button className="secondary" onClick={() => void loadReview("due")}>Due Review</button>
              </div>
            </div>
          )}

          {!quizComplete && !review?.canStart && (
            <div className="empty-state">
              <h3>No quiz ready</h3>
              <p>{review?.reason || "Import at least four terms to start."}</p>
              <div className="quiz-actions">
                <button onClick={() => void loadReview("wrong")} disabled={items.length < 4 || stats.wrong === 0}>Wrong Queue</button>
                <button onClick={() => void loadReview("all")} disabled={items.length < 4}>Practice All</button>
                <button className="secondary" onClick={() => setTab("import")}>Import Vocabulary</button>
              </div>
            </div>
          )}

          {!quizComplete && review?.canStart && currentQuestion && (
            <article className="quiz-panel">
              <div className="question-meta">
                <span>{currentQuestion.reviewState.status}</span>
                <span>Wrong {currentQuestion.reviewState.wrongCount}</span>
                <span>Streak {currentQuestion.reviewState.correctStreak}</span>
              </div>
              <h3>{currentQuestion.term}</h3>
              <div className="options-grid">
                {currentQuestion.options.map((option) => {
                  const selected = feedback?.selectedDefinition === option;
                  const correct = feedback?.correctDefinition === option;
                  return (
                    <button
                      key={option}
                      className={[
                        "option-button",
                        selected ? "selected" : "",
                        feedback && correct ? "correct" : "",
                        feedback && selected && !correct ? "wrong" : ""
                      ].filter(Boolean).join(" ")}
                      onClick={() => void chooseAnswer(option)}
                      disabled={Boolean(feedback)}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              {feedback && (
                <div className={`notice ${feedback.isCorrect ? "success" : "error"}`}>
                  {feedback.isCorrect ? "Correct." : `Wrong. Correct answer: ${feedback.correctDefinition}`}
                </div>
              )}
              <div className="quiz-actions">
                <button onClick={() => void nextQuestion()} disabled={!feedback}>
                  {questionIndex + 1 >= review.questions.length ? "Finish" : "Next"}
                </button>
              </div>
            </article>
          )}
        </section>
      )}

      {tab === "import" && (
        <section className="workspace">
          <div className="section-head">
            <div>
              <h2>Paste Vocabulary</h2>
              <p>Use one term per line. Definitions should be in English.</p>
            </div>
            <button className="secondary" onClick={() => setImportText(sampleText)}>Use Sample</button>
          </div>
          <textarea
            className="import-box"
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder="estoppel - A rule preventing a person from denying something..."
          />
          <div className="import-actions">
            <button onClick={() => void importVocabulary()}>Import</button>
            <button className="secondary" onClick={() => setImportText("")}>Clear</button>
          </div>
          {importResult && (
            <ImportSummary result={importResult} />
          )}
        </section>
      )}

      {tab === "library" && (
        <section className="workspace">
          <div className="section-head">
            <div>
              <h2>Vocabulary Library</h2>
              <p>{visibleItems.length}/{items.length} local items</p>
            </div>
            <div className="section-actions">
              <button className="secondary" onClick={() => void backfillQuality()}>Backfill quality</button>
              <button className="secondary" onClick={() => void loadItems()}>Refresh</button>
            </div>
          </div>
          {qualityBackfill && (
            <div className="notice success">
              Scanned {qualityBackfill.scanned}, updated {qualityBackfill.updated}, needs review {qualityBackfill.needsReview}.
            </div>
          )}
          <div className="filter-bar" aria-label="Library filters">
            <FilterButton label="Tomorrow" value={libraryCounts.tomorrow} active={libraryFilter === "tomorrow"} onClick={() => setLibraryFilter("tomorrow")} />
            <FilterButton label="Wrong" value={libraryCounts.wrong} active={libraryFilter === "wrong"} onClick={() => setLibraryFilter("wrong")} />
            <FilterButton label="Needs review" value={libraryCounts.needsReview} active={libraryFilter === "needsReview"} onClick={() => setLibraryFilter("needsReview")} />
            <FilterButton label="Learning" value={libraryCounts.learning} active={libraryFilter === "learning"} onClick={() => setLibraryFilter("learning")} />
            <FilterButton label="Mastered" value={libraryCounts.mastered} active={libraryFilter === "mastered"} onClick={() => setLibraryFilter("mastered")} />
            <FilterButton label="All" value={libraryCounts.all} active={libraryFilter === "all"} onClick={() => setLibraryFilter("all")} />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                  <tr>
                    <th>Term</th>
                    <th>Pronunciation</th>
                    <th>Quality</th>
                    <th>Definition</th>
                    <th>Status</th>
                    <th>Next review</th>
                    <th>Wrong</th>
                    <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => editingItemId === item.id && editDraft ? (
                  <tr key={item.id} className="edit-row">
                    <td colSpan={8}>
                      <EditItemForm
                        draft={editDraft}
                        onChange={setEditDraft}
                        onSave={() => void saveEditedItem(item)}
                        onCancel={cancelEditingItem}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={item.id}>
                    <td className="term-cell">{item.term}</td>
                    <td>{item.phonetic || item.pronunciation || ""}</td>
                    <td><QualityBadge item={item} /></td>
                    <td>{item.definition}</td>
                    <td>{item.reviewState.status}</td>
                    <td>{item.reviewState.nextReviewAt || "Now"}</td>
                    <td>{item.reviewState.wrongCount}</td>
                    <td>
                      <LibraryActions
                        item={item}
                        onEdit={() => startEditingItem(item)}
                        onRecheck={() => void recheckItem(item)}
                        onMarkOk={() => void markQualityOk(item)}
                        onDelete={() => void deleteLibraryItem(item)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function PronunciationLabels({ result }: { result: DictionaryResult }) {
  const labels = Array.from(new Set([result.phonetic, result.pronunciation].filter(Boolean)));
  if (labels.length === 0) return null;

  return (
    <p>
      {labels.map((label) => <span key={label}>{label}</span>)}
    </p>
  );
}

function QualityBadge({ item }: { item: VocabItem }) {
  const quality = item.lookupQuality;
  const label = item.sourceLabel || (quality ? formatLookupQuality(quality) : "Manual");
  const needsReview = needsDefinitionReview(item);

  return (
    <span className={needsReview ? "quality-badge needs-review" : "quality-badge"} title={item.lookupWarning || label}>
      {needsReview ? "Needs review" : label}
    </span>
  );
}

function LibraryActions({
  item,
  onEdit,
  onRecheck,
  onMarkOk,
  onDelete
}: {
  item: VocabItem;
  onEdit: () => void;
  onRecheck: () => void;
  onMarkOk: () => void;
  onDelete: () => void;
}) {
  const needsReview = needsDefinitionReview(item);

  return (
    <div className="library-actions">
      <button className="secondary compact" onClick={onEdit}>Edit</button>
      {needsReview && <button className="secondary compact" onClick={onRecheck}>Recheck</button>}
      {needsReview && <button className="secondary compact" onClick={onMarkOk}>Mark OK</button>}
      <button className="secondary compact danger" onClick={onDelete}>Delete</button>
    </div>
  );
}

function EditItemForm({
  draft,
  onChange,
  onSave,
  onCancel
}: {
  draft: EditDraft;
  onChange: (draft: EditDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const update = (key: keyof EditDraft, value: string) => onChange({ ...draft, [key]: value });

  return (
    <div className="edit-item-form">
      <label>
        <span>Term</span>
        <input value={draft.term} onChange={(event) => update("term", event.target.value)} />
      </label>
      <label>
        <span>English definition</span>
        <textarea value={draft.definition} onChange={(event) => update("definition", event.target.value)} />
      </label>
      <label>
        <span>中文</span>
        <textarea value={draft.chineseDefinition} onChange={(event) => update("chineseDefinition", event.target.value)} />
      </label>
      <label>
        <span>Legal context</span>
        <textarea value={draft.legalContext} onChange={(event) => update("legalContext", event.target.value)} />
      </label>
      <div className="edit-grid">
        <label>
          <span>Phonetic</span>
          <input value={draft.phonetic} onChange={(event) => update("phonetic", event.target.value)} />
        </label>
        <label>
          <span>Pronunciation</span>
          <input value={draft.pronunciation} onChange={(event) => update("pronunciation", event.target.value)} />
        </label>
      </div>
      <div className="quiz-actions">
        <button onClick={onSave}>Save</button>
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function formatLookupQuality(quality: NonNullable<DictionaryResult["lookupQuality"]>): string {
  if (quality === "ai-legal") return "AI legal";
  if (quality === "legal-glossary") return "Legal glossary";
  if (quality === "saved") return "Saved";
  if (quality === "reference") return "Reference";
  return "Fallback";
}

function LegalNotePanel({ note }: { note: LegalEnglishNote }) {
  return (
    <section className="legal-note">
      <div>
        <h4>Legal English</h4>
        <p className="chinese-meaning">{note.chineseMeaning}</p>
      </div>
      <p>{note.legalRegister}</p>
      <p>{note.contextExplanation}</p>
      {note.pattern && <p><strong>Pattern:</strong> {note.pattern}</p>}
      {note.examples.length > 0 && (
        <div className="example-list">
          {note.examples.map((example) => (
            <article key={example.sentence}>
              <p>{example.sentence}</p>
              <span>{example.translation}</span>
            </article>
          ))}
        </div>
      )}
      {note.comparison && note.comparison.length > 0 && (
        <div className="comparison-grid">
          {note.comparison.map((item) => (
            <div key={item.term}>
              <strong>{item.term}</strong>
              <span>{item.meaning}</span>
              <p>{item.usage}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FilterButton({ label, value, active, onClick }: { label: string; value: number; active: boolean; onClick: () => void }) {
  return (
    <button className={active ? "active" : ""} onClick={onClick}>
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  );
}

function ImportSummary({ result }: { result: ImportResult }) {
  return (
    <div className="import-summary">
      <div className="summary-row">
        <span>Imported</span>
        <strong>{result.imported}</strong>
        <span>Updated</span>
        <strong>{result.updated}</strong>
        <span>Failed</span>
        <strong>{result.failed.length}</strong>
      </div>
      {result.items.length > 0 && (
        <ul className="preview-list">
          {result.items.slice(0, 8).map((item) => (
            <li key={item.id}>
              <strong>{item.term}</strong>
              <span>{item.definition}</span>
            </li>
          ))}
        </ul>
      )}
      {result.failed.length > 0 && (
        <div className="failure-list">
          {result.failed.map((failure) => (
            <p key={`${failure.line}-${failure.text}`}>
              Line {failure.line}: {failure.reason}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...init?.headers
      }
    });
  } catch {
    throw new Error("Local learning service is not running. Open 大王查词 from the Desktop, then try again.");
  }
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Request failed");
  }

  return data as T;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowKey(): string {
  const date = new Date(`${todayKey()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function dataUrlToFile(dataUrl: string, name: string, fallbackType: string): File {
  const [header, base64 = ""] = dataUrl.split(",");
  const mimeType = header.match(/^data:(.*?);base64$/)?.[1] || fallbackType;
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], name, { type: mimeType });
}

function matchesLibraryFilter(item: VocabItem, filter: LibraryFilter): boolean {
  if (filter === "all") return true;
  if (filter === "needsReview") return needsDefinitionReview(item);
  if (filter === "tomorrow") return item.reviewState.nextReviewAt === tomorrowKey();
  if (filter === "wrong") return isWrongQueueItem(item);
  if (filter === "learning") return item.reviewState.status !== "mastered";
  return item.reviewState.status === "mastered";
}

function getLibraryCounts(items: VocabItem[]) {
  const tomorrow = tomorrowKey();
  return {
    needsReview: items.filter(needsDefinitionReview).length,
    tomorrow: items.filter((item) => item.reviewState.nextReviewAt === tomorrow).length,
    wrong: items.filter(isWrongQueueItem).length,
    learning: items.filter((item) => item.reviewState.status !== "mastered").length,
    mastered: items.filter((item) => item.reviewState.status === "mastered").length,
    all: items.length
  };
}

function isWrongQueueItem(item: VocabItem): boolean {
  return item.reviewState.wrongCount > 0 && item.reviewState.status !== "mastered";
}

function needsDefinitionReview(item: VocabItem): boolean {
  return item.lookupQuality === "dictionary" || item.lookupQuality === "reference";
}

function quizTitle(mode: QuizMode): string {
  return {
    due: "Due Review",
    wrong: "Wrong Queue",
    all: "Practice All"
  }[mode];
}

function quizStatus(mode: QuizMode): string {
  return {
    due: "Reviewing due items",
    wrong: "Reviewing wrong queue",
    all: "Practicing all"
  }[mode];
}

function normalizeOcrText(value: string): string {
  const compact = value
    .replace(/[^\p{L}\s'-]/gu, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  return compact.slice(0, 80);
}

function normalizeSelectedLookupText(value: string): string {
  const compact = value
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

function statusRank(status: ReviewStatus): number {
  return {
    learning: 0,
    new: 1,
    review: 2,
    mastered: 3
  }[status];
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
