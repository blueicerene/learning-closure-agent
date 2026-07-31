import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { recognize } from "tesseract.js";
import {
  buildMonthGrid,
  calendarMarkerKind,
  calendarStatusLabel,
  formatMonthTitle,
  makeCalendarFixture,
  shiftMonth,
  type DailyPlanCalendarDay,
  type DailyPlanCalendarResponse
} from "./dailyPlanCalendar";
import {
  quizResultFallbacks,
  quizResultFixture,
  type QuizExample,
  type QuizResultFixtureMode
} from "./quizResult";
import { refreshAfterQuizAnswer } from "./quizAnswerRefresh";
import { appendReinforcementQuestion } from "./quizReinforcement";
import {
  firstUnattemptedQuestionIndex,
  isFocusRoundComplete,
  recordFocusAttempt,
  type FocusProgress
} from "./focusRound";
import { quizProgress } from "./quizPlanProgress";
import "./styles.css";

type ReviewStatus = "new" | "learning" | "review" | "mastered";
type ReviewResult = "correct" | "wrong";
type LookupSource = "web" | "extension-selection" | "extension-image" | "desktop-image";

type LookupEvent = {
  eventId: string;
  source: LookupSource;
  occurredAt: string;
};

type LookupStats = {
  count: number;
  firstLookedUpAt: string;
  lastLookedUpAt: string;
  historicalCountKnown: boolean;
};

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
  focus?: boolean;
  focusRecoveryCorrectCount?: number;
  reinforcementPending?: boolean;
  reinforcementSessionId?: string;
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
  lookupStats?: LookupStats;
  isImportant: boolean;
  questionQuality?: {
    status: "eligible" | "pending-review";
    reasons?: string[];
  };
  retiredAt?: string;
  retiredReason?: string;
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
  retired: number;
};

type ItemsResponse = {
  items: VocabItem[];
  stats: VocabStats;
  dateContext: {
    learningDate: string;
    nextLearningDate: string;
  };
};

type LearningStatus = {
  generatedAt: string;
  todayAdded: number;
  dueToday: number;
  learningStreakDays: number;
  dailyTestStreakDays: number;
  dailyPlanTotal: number;
  dailyPlanCompleted: number;
  masteryRate: number;
  mastered: number;
  total: number;
  repeatedWrong: number;
  petState: "idle" | "due" | "encourage" | "failure" | "focus";
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
  phonetic?: string;
  legalContext?: string;
  examples: QuizExample[];
  reviewState: ReviewState;
  attemptKind?: "plan" | "reinforcement" | "independent";
};

type ReviewResponse = {
  date: string;
  canStart: boolean;
  reason?: string;
  questions: ReviewQuestion[];
  focusProgress?: {
    total: number;
    roundId?: string;
    attemptCount: number;
    focusRoundItems: number;
    attemptedItemIds: string[];
  };
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
  action: "marked-ok" | "rechecked" | "updated" | "retired";
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
type QuizMode = "due" | "all" | "wrong" | "focus";
type LibraryFilter = "needsReview" | "tomorrow" | "wrong" | "pending" | "reviewing" | "mastered" | "retired" | "all";
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
  const quizResultFixtureMode = getQuizResultFixtureMode();
  const [tab, setTab] = useState<Tab>("dictionary");
  const [items, setItems] = useState<VocabItem[]>([]);
  const [stats, setStats] = useState<VocabStats>({ total: 0, dueToday: 0, tomorrow: 0, wrong: 0, learning: 0, reviewed: 0, mastered: 0, needsReview: 0, retired: 0 });
  const [libraryDateContext, setLibraryDateContext] = useState({ learningDate: "", nextLearningDate: "" });
  const [learningStatus, setLearningStatus] = useState<LearningStatus>({
    generatedAt: "",
    todayAdded: 0,
    dueToday: 0,
    learningStreakDays: 0,
    dailyTestStreakDays: 0,
    dailyPlanTotal: 0,
    dailyPlanCompleted: 0,
    masteryRate: 0,
    mastered: 0,
    total: 0,
    repeatedWrong: 0,
    petState: "idle",
    message: "准备好了",
    reviewUrl: "http://127.0.0.1:5174/"
  });
  const [focusAvailableCount, setFocusAvailableCount] = useState(0);
  const [calendar, setCalendar] = useState<DailyPlanCalendarResponse | null>(null);
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [taskRailExpanded, setTaskRailExpanded] = useState(false);
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [quizMode, setQuizMode] = useState<QuizMode>("due");
  const [quizComplete, setQuizComplete] = useState(false);
  const [quizSessionId, setQuizSessionId] = useState<string>(() => crypto.randomUUID());
  const [answerSubmitting, setAnswerSubmitting] = useState(false);
  const [questionIssueReported, setQuestionIssueReported] = useState(false);
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
  const [status, setStatus] = useState("准备好了");
  const [error, setError] = useState("");

  useEffect(() => {
    if (quizResultFixtureMode) {
      const fixtureQuestion = quizResultFixture(quizResultFixtureMode);
      const nextFixtureQuestion = {
        ...quizResultFixture("correct"),
        itemId: "fixture-next-question",
        term: "injunction",
        phonetic: "/ɪnˈdʒʌŋkʃən/",
        correctDefinition:
          "A court order requiring a person to do or stop doing a specific act.",
        options: [
          "A court order requiring a person to do or stop doing a specific act.",
          "A prior judicial decision used as authority in a later case.",
          "A formal accusation that a person committed a criminal offence.",
          "A payment made to secure a person's release before trial."
        ],
        legalContext: "禁令是法院命令当事人采取或停止特定行为的救济方式。",
        examples: [{
          sentence: "The court granted an injunction preventing the disclosure of confidential records.",
          translation: "法院颁发禁令，禁止披露机密记录。"
        }]
      };
      setTab("quiz");
      setReview({
        date: todayKey(),
        canStart: true,
        questions: [
          {
            ...fixtureQuestion,
            reviewState: {
              status: "review",
              correctStreak: 1,
              wrongCount: quizResultFixtureMode === "wrong" ? 1 : 0
            }
          },
          {
            ...nextFixtureQuestion,
            reviewState: {
              status: "review",
              correctStreak: 0,
              wrongCount: 0
            }
          }
        ]
      });
      setFeedback({
        isCorrect: quizResultFixtureMode !== "wrong",
        selectedDefinition: quizResultFixtureMode === "wrong"
          ? fixtureQuestion.options[1]
          : fixtureQuestion.correctDefinition,
        correctDefinition: fixtureQuestion.correctDefinition
      });
      setStatus("结果页预览");
      return;
    }
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
      const payload = event.data as {
        type?: string;
        name?: string;
        mimeType?: string;
        dataUrl?: string;
        lookupEventId?: string;
        message?: string;
      };

      if (payload?.type === "LCA_IMAGE_WORD_LOOKUP_ERROR") {
        setError(payload.message || "无法读取拖入的图片。");
        return;
      }

      if (payload?.type !== "LCA_IMAGE_WORD_LOOKUP" || typeof payload.dataUrl !== "string") return;
      try {
        const file = dataUrlToFile(payload.dataUrl, payload.name || "dropped-image.png", payload.mimeType || "image/png");
        setTab("dictionary");
        void recognizeImage(file, createLookupEvent(
          "extension-image",
          payload.lookupEventId || crypto.randomUUID()
        ));
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
    void lookupDictionary(term, createLookupEvent(
      parseLookupSource(params.get("lookupSource")) ?? "web",
      params.get("lookupEventId") || crypto.randomUUID()
    ));
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
        void recognizeImage(file, createLookupEvent("desktop-image", imageKey));
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
  const nextPendingQuestionIndex = review
    ? quizMode === "focus" && review.focusProgress
      ? firstUnattemptedQuestionIndex(
        review.questions.map((question) => question.itemId),
        review.focusProgress.attemptedItemIds,
        questionIndex
      )
      : questionIndex + 1 < review.questions.length ? questionIndex + 1 : -1
    : -1;
  const testedCount = review
    ? Math.min(
      quizMode === "focus" && review.focusProgress?.attemptCount != null
        ? review.focusProgress.attemptCount
        : questionIndex + (feedback ? 1 : 0),
      review.questions.length
    )
    : 0;
  const displayedQuizProgress = quizProgress(
    quizMode,
    testedCount,
    review?.questions.length ?? 0,
    learningStatus
  );
  const activeDictionaryResult = dictionaryResult && normalizeLookupKey(dictionaryResultQuery) === normalizeLookupKey(lookupTerm)
    ? dictionaryResult
    : null;

  useEffect(() => {
    if (quizResultFixtureMode || tab !== "quiz" || quizComplete || feedback || !currentQuestion) return;

    let cancelled = false;
    const occurredAt = new Date().toISOString();
    void request<{ itemId: string; occurredAt: string }>("/api/vocab/quiz-activity", {
      method: "POST",
      body: JSON.stringify({ itemId: currentQuestion.itemId, occurredAt })
    })
      .then(() => {
        if (!cancelled) return loadLearningStatus();
      })
      .catch((err) => {
        if (!cancelled) showError(err);
      });

    return () => {
      cancelled = true;
    };
  }, [tab, quizComplete, feedback, currentQuestion?.itemId]);

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
    return items.filter((item) => matchesLibraryFilter(item, libraryFilter, libraryDateContext.nextLearningDate)).sort((a, b) => {
      const statusOrder = statusRank(a.reviewState.status) - statusRank(b.reviewState.status);
      const reviewDateOrder = (a.reviewState.nextReviewAt || "").localeCompare(b.reviewState.nextReviewAt || "");
      return statusOrder || reviewDateOrder || a.term.localeCompare(b.term);
    });
  }, [items, libraryFilter, libraryDateContext.nextLearningDate]);
  const libraryCounts = useMemo(
    () => getLibraryCounts(items, libraryDateContext.nextLearningDate),
    [items, libraryDateContext.nextLearningDate]
  );
  const currentLibraryFilterLabel = libraryFilterLabel(libraryFilter);

  async function refreshAll() {
    setError("");
    await Promise.all([
      loadItems(),
      loadReview(),
      loadLearningStatus(),
      loadFocusAvailability(),
      loadCalendar()
    ]);
  }

  async function loadItems() {
    try {
      const data = await request<ItemsResponse>("/api/vocab/items");
      setItems(data.items);
      setStats(data.stats);
      setLibraryDateContext(data.dateContext);
    } catch (err) {
      showError(err);
    }
  }

  async function loadFocusAvailability() {
    try {
      const focus = await request<ReviewResponse>("/api/vocab/review?mode=focus");
      if (!focus.canStart) {
        setFocusAvailableCount(0);
        return;
      }

      const focusCount = focus.focusProgress?.focusRoundItems ?? focus.questions.length;
      setFocusAvailableCount(Math.max(0, focusCount));
    } catch {
      // 若 focus 接口偶发失败，保底用学习状态口径，避免影响页面可用性
    }
  }

  async function loadReview(mode: QuizMode = "due", forceRestart = false) {
    try {
      const params = new URLSearchParams();
      if (mode !== "due") params.set("mode", mode);
      if (mode === "focus" && forceRestart) params.set("restartFocusRound", "1");
      const query = params.size > 0 ? `?${params.toString()}` : "";
      const data = await request<ReviewResponse>(`/api/vocab/review${query}`);
      const focusCount = data.focusProgress?.focusRoundItems ?? data.questions.length;
      if (mode === "focus") {
        setFocusAvailableCount(Math.max(0, focusCount));
      }
      setQuizMode(mode);
      setReview({
        ...data,
        questions: data.questions.map((question) => ({
        ...question,
        attemptKind: mode === "due" ? "plan" : "independent"
        }))
      });
      const focusProgress = mode === "focus" ? data.focusProgress : undefined;
      const resumeIndex = focusProgress
        ? firstUnattemptedQuestionIndex(
          data.questions.map((question) => question.itemId),
          focusProgress.attemptedItemIds
        )
        : 0;
      setQuizSessionId(focusProgress?.roundId ?? crypto.randomUUID());
      setQuestionIndex(Math.max(0, resumeIndex));
      setFeedback(null);
      setQuestionIssueReported(false);
      setQuizComplete(mode === "focus" && isFocusRoundComplete(focusProgress));
      setStatus(quizStatus(mode));
    } catch (err) {
      showError(err);
    }
  }

  async function loadLearningStatus() {
    try {
      const status = await request<LearningStatus>("/api/vocab/learning-status");
      setLearningStatus(status);
    } catch (err) {
      showError(err);
    }
  }

  async function loadCalendar(month?: string) {
    try {
      const monthQuery = month ? `?month=${encodeURIComponent(month)}` : "";
      const data = await request<DailyPlanCalendarResponse>(`/api/vocab/calendar${monthQuery}`);
      const previewFixture = import.meta.env.DEV
        && new URLSearchParams(window.location.search).get("calendarFixture") === "1";
      setCalendar(previewFixture ? makeCalendarFixture(data) : data);
    } catch (err) {
      showError(err);
    }
  }

  async function importVocabulary() {
    const text = importText.trim();
    if (!text) {
      setError("请先粘贴词汇文本。");
      return;
    }

    setStatus("正在导入");
    setError("");
    setImportResult(null);

    try {
      const result = await request<ImportResult>("/api/vocab/import", {
        method: "POST",
        body: JSON.stringify({ text })
      });
      setImportResult(result);
      setStatus("导入完成");
      await refreshAll();
    } catch (err) {
      showError(err);
      setStatus("需要处理");
    }
  }

  async function lookupDictionary(termOverride?: string, lookupEvent = createLookupEvent("web")) {
    const term = (termOverride ?? lookupTerm).trim();
    if (!term) {
      setError("请先输入要查询的法律英语词汇。");
      return;
    }

    setLookupTerm(term);
    setStatus("正在查询");
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
        setStatus("查询完成");
        void saveLookupResult(result, lookupEvent)
          .then(async (savedResult) => {
            const savedItem = savedResult.item;
            if (savedItem.chineseDefinition && !result.chineseDefinition) {
              setDictionaryResult((current) => current && normalizeLookupKey(current.term) === normalizeLookupKey(result.term)
                ? { ...current, chineseDefinition: savedItem.chineseDefinition, legalContext: savedItem.legalContext || current.legalContext }
                : current);
            }
            setSavedLookupItem(savedItem);
            setSavedLookupCreated(savedResult.created);
            setStatus(savedResult.created ? "已加入复习" : "已在复习计划中");
            await refreshAll();
          })
          .catch(showError);
      } else {
        setStatus("没有找到");
      }
    } catch (err) {
      showError(err);
      setStatus("需要处理");
    }
  }

  async function saveLookupResult(result: DictionaryResult, lookupEvent: LookupEvent) {
    return request<SaveLookupResult>("/api/vocab/lookup/save-entry", {
      method: "POST",
      body: JSON.stringify({ ...result, lookupEvent })
    });
  }

  async function removeSavedLookup(label: "Undo" | "Ignore") {
    if (!savedLookupItem) return;
    if (!savedLookupCreated) {
      setSavedLookupItem(null);
      setStatus("已保留原复习词条");
      return;
    }

    try {
      await request<{ deleted: boolean }>(`/api/vocab/items/${encodeURIComponent(savedLookupItem.id)}`, {
        method: "DELETE"
      });
      setSavedLookupItem(null);
      setSavedLookupCreated(false);
      setStatus(label === "Undo" ? "已撤销保存" : "已忽略");
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
      setStatus(`已更新 ${result.updated} 个词条`);
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
      setStatus(`已确认 ${item.term}`);
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
      setStatus(`已重新检查 ${item.term}`);
      await loadItems();
    } catch (err) {
      showError(err);
    }
  }

  async function retireLibraryItem(item: VocabItem) {
    if (!window.confirm(`确定将“${item.term}”移出学习吗？历史完成记录会保留，但它不会再进入测试或复习计划。`)) {
      return;
    }
    setError("");
    try {
      await request<QualityActionResult>(`/api/vocab/items/${encodeURIComponent(item.id)}/retire`, {
        method: "POST",
        body: JSON.stringify({ reason: "用户从词库中移出该词条。" })
      });
      setStatus(`已将 ${item.term} 移出学习，历史记录仍保留。`);
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
      setStatus(`已更新 ${editDraft.term}`);
      cancelEditingItem();
      await loadItems();
    } catch (err) {
      showError(err);
    }
  }

  async function recognizeImage(file: File | null, lookupEvent = createLookupEvent("web")) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请把图片文件拖到查词输入框。");
      return;
    }

    setError("");
    setDictionaryResult(null);
    setSavedLookupItem(null);
    setOcrStatus("正在识别图片");
    setStatus("正在识别图片");

    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    const previewUrl = URL.createObjectURL(file);
    setImagePreviewUrl(previewUrl);

    try {
      const result = await recognize(file, "eng");
      const text = normalizeOcrText(result.data.text);
      if (!text) {
        setOcrStatus("没有识别出清晰词汇");
        setStatus("需要处理");
        setError("图片中没有识别出清晰的英文词汇。");
        return;
      }

      setLookupTerm(text);
      setDictionaryResult(null);
      setDictionaryResultQuery("");
      setSavedLookupItem(null);
      setOcrStatus(`已识别：${text}`);
      setStatus("识别完成，正在查询");
      await lookupDictionary(text, lookupEvent);
    } catch (err) {
      showError(err);
      setOcrStatus("图片识别失败");
      setStatus("需要处理");
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
    if (!currentQuestion || feedback || answerSubmitting) return;

    const isCorrect = option === currentQuestion.correctDefinition;
    setAnswerSubmitting(true);
    setFeedback({
      isCorrect,
      selectedDefinition: option,
      correctDefinition: currentQuestion.correctDefinition
    });

    try {
      const answeredItem = await request<VocabItem>("/api/vocab/answer", {
        method: "POST",
        body: JSON.stringify({
          itemId: currentQuestion.itemId,
          selectedDefinition: option,
          correctDefinition: currentQuestion.correctDefinition,
          isCorrect,
          sessionId: quizSessionId,
          focusRoundId: quizMode === "focus" ? review?.focusProgress?.roundId : undefined,
          attemptKind: currentQuestion.attemptKind ?? (quizMode === "due" ? "plan" : "independent")
        })
      });
      if (quizMode === "focus" && review?.focusProgress) {
        setReview((current) => current?.focusProgress
          ? {
            ...current,
            focusProgress: recordFocusAttempt(
              current.focusProgress as FocusProgress,
              currentQuestion.itemId
            ),
            questions: current.questions.map((question) => question.itemId === answeredItem.id
              ? { ...question, reviewState: answeredItem.reviewState }
              : question)
          }
          : current);
      }
      if (
        !isCorrect
        && answeredItem.reviewState.reinforcementPending
        && currentQuestion.attemptKind !== "reinforcement"
      ) {
        setReview((current) => {
          if (!current || current.questions.length >= 20) return current;
          return {
            ...current,
            questions: appendReinforcementQuestion(
              current.questions,
              currentQuestion,
              questionIndex
            )
          };
        });
      }
      await refreshAfterQuizAnswer({
        month: calendar?.month,
        loadItems,
        loadLearningStatus,
        loadCalendar,
        loadFocusAvailability
      });
    } catch (err) {
      setFeedback(null);
      showError(err);
    } finally {
      setAnswerSubmitting(false);
    }
  }

  async function nextQuestion() {
    if (!review) return;

    const nextIndex = quizMode === "focus" && review.focusProgress
      ? firstUnattemptedQuestionIndex(
        review.questions.map((question) => question.itemId),
        review.focusProgress.attemptedItemIds,
        questionIndex
      )
      : questionIndex + 1 < review.questions.length ? questionIndex + 1 : -1;
    if (nextIndex < 0) {
      setStatus("本轮复习完成");
      setQuizComplete(true);
      return;
    }

    setQuestionIndex(nextIndex);
    setFeedback(null);
    setQuestionIssueReported(false);
  }

  async function reportCurrentQuestionIssue() {
    if (!currentQuestion || questionIssueReported) return;
    try {
      await request(`/api/vocab/items/${encodeURIComponent(currentQuestion.itemId)}/question-issue`, {
        method: "POST",
        body: JSON.stringify({ reason: "用户在测试结果页标记题目有问题。" })
      });
      setQuestionIssueReported(true);
      setStatus("已标记待检查，本题不会计入错题");
      await Promise.all([loadItems(), loadLearningStatus()]);
    } catch (err) {
      showError(err);
    }
  }

  function showError(err: unknown) {
    setError(err instanceof Error ? err.message : "操作失败，请稍后重试。");
  }

  function speakTerm(term: string) {
    speakWithBrowserVoice(term);
  }

  function speakWithBrowserVoice(term: string) {
    if (!("speechSynthesis" in window)) {
      setError("当前浏览器无法使用发音功能。");
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

  const dailyPlanTotal = learningStatus.dailyPlanTotal;
  const dailyPlanCompleted = Math.min(learningStatus.dailyPlanCompleted, dailyPlanTotal);
  const dailyPlanRemaining = Math.max(0, dailyPlanTotal - dailyPlanCompleted);
  const dailyPlanProgress = dailyPlanTotal > 0 ? Math.round((dailyPlanCompleted / dailyPlanTotal) * 100) : 0;

  return (
    <main className={`app-shell ${taskRailExpanded ? "task-rail-open" : ""}`}>
      <header className="masthead">
        <div>
          <p className="eyebrow">法律英语复习</p>
          <h1>大王陪你背单词</h1>
          <p className="masthead-copy">按计划完成今天的复习任务</p>
        </div>
        <div className="status-pill">{status}</div>
      </header>

      <nav className="tabs" aria-label="功能导航">
        <button className={tab === "dictionary" ? "active" : ""} onClick={() => setTab("dictionary")}>查词</button>
        <button className={tab === "quiz" ? "active" : ""} onClick={() => setTab("quiz")}>今日测试</button>
        <button className={tab === "import" ? "active" : ""} onClick={() => setTab("import")}>批量导入</button>
        <button className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}>词库</button>
      </nav>

      <div className="app-layout">
        <div className="primary-pane">
          {error && <div className="notice error">{error}</div>}

          {tab === "dictionary" && (
        <section className="workspace">
          <div className="section-head">
            <div>
              <h2>法律英语查词</h2>
              <p>查询词义和发音，并自动加入复习计划。</p>
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
            <button onClick={() => void lookupDictionary()}>查询</button>
          </div>

          <div className="image-lookup">
            <label className="image-upload">
              <span>图片识词</span>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => void recognizeImage(event.target.files?.[0] ?? null)}
              />
            </label>
            {ocrStatus && <p>{ocrStatus}</p>}
            {imagePreviewUrl && <img src={imagePreviewUrl} alt="待识别的词汇图片" />}
          </div>

          {activeDictionaryResult && (
            <article className="dictionary-card">
              <div className="dictionary-title">
                <div>
                  <h3>{activeDictionaryResult.term}</h3>
                  <PronunciationLabels result={activeDictionaryResult} />
                </div>
                <button className="secondary" onClick={() => speakTerm(activeDictionaryResult.term)}>发音</button>
              </div>
              {activeDictionaryResult.found ? (
                <>
                  <div className="question-meta">
                    <span>{formatSourceLabel(activeDictionaryResult.sourceLabel)}</span>
                    {activeDictionaryResult.lookupQuality && <span>{formatLookupQuality(activeDictionaryResult.lookupQuality)}</span>}
                    {activeDictionaryResult.legalNote && <span>法律英语说明</span>}
                    {savedLookupItem && <LookupBadge item={savedLookupItem} />}
                  </div>
                  {activeDictionaryResult.lookupWarning && (
                    <div className="notice warning">{formatLookupWarning(activeDictionaryResult.lookupWarning)}</div>
                  )}
                  {speechVoices.length > 0 && (
                    <label className="voice-picker">
                      <span>声音</span>
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
                        <span>英文释义</span>
                        <p
                          className="definition-text"
                          onMouseUp={handleDefinitionSelection}
                          onTouchEnd={handleDefinitionSelection}
                        >
                          {activeDictionaryResult.definition}
                        </p>
                      </section>
                      <section className="bilingual-definition context">
                        <span>法律语境</span>
                        <p>{activeDictionaryResult.legalContext || activeDictionaryResult.legalNote?.contextExplanation || "普通词，但在法律材料中应结合上下文理解。"}</p>
                      </section>
                      {activeDictionaryResult.legalNote && <LegalNotePanel note={activeDictionaryResult.legalNote} />}
                      <div className="quiz-actions">
                        <span className="saved-pill">{savedLookupItem ? (savedLookupCreated ? "已加入复习" : "已在复习计划中") : "正在保存"}</span>
                        <button className="secondary" onClick={() => speakTerm(activeDictionaryResult.term)}>再次发音</button>
                        <button className="secondary" onClick={() => void removeSavedLookup("Undo")} disabled={!savedLookupItem || !savedLookupCreated}>撤销</button>
                        <button className="secondary" onClick={() => void removeSavedLookup("Ignore")} disabled={!savedLookupItem || !savedLookupCreated}>忽略</button>
                      </div>
                    </>
                  ) : (
                    <div className="notice bilingual-loading">正在整理中英文释义...</div>
                  )}
                </>
              ) : (
                <div className="notice error">暂未找到可靠的在线释义。</div>
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
              <p>{review ? `${review.date} · 已完成 ${displayedQuizProgress.completed}/${displayedQuizProgress.total}` : "正在加载"}</p>
            </div>
            <div className="quiz-actions">
              <button className={quizMode === "due" ? "" : "secondary"} onClick={() => void loadReview("due")}>今日任务</button>
              <button className={quizMode === "focus" ? "" : "secondary"} onClick={() => void loadReview("focus")} disabled={items.length < 4 || focusAvailableCount === 0}>重点复习</button>
              <button className={quizMode === "all" ? "" : "secondary"} onClick={() => void loadReview("all")} disabled={items.length < 4}>全部练习</button>
            </div>
          </div>

          {quizComplete && review?.canStart && (
            <div className="empty-state">
              <h3>本轮复习完成</h3>
              <p>可以再练一次，或切换到其他复习范围。</p>
              <div className="quiz-actions">
                <button onClick={() => void loadReview(quizMode, true)}>再练一次</button>
                <button className="secondary" onClick={() => void loadReview("due")}>返回到期任务</button>
              </div>
            </div>
          )}

          {!quizComplete && !review?.canStart && (
            <div className="empty-state">
              <h3>暂时无法开始测试</h3>
              <p>{review?.reason || "词库至少需要四个词条才能生成四选一题目。"}</p>
              <div className="quiz-actions">
                <button onClick={() => void loadReview("due")}>返回今日任务</button>
                <button onClick={() => void loadReview("focus")} disabled={items.length < 4 || focusAvailableCount === 0}>重点复习</button>
                <button onClick={() => void loadReview("all")} disabled={items.length < 4}>练习全部词汇</button>
                <button className="secondary" onClick={() => setTab("import")}>导入词汇</button>
              </div>
            </div>
          )}

          {!quizComplete && review?.canStart && currentQuestion && (
            <article className="quiz-panel">
              <div className="question-meta">
                <span>{formatReviewStatus(currentQuestion.reviewState.status)}</span>
                <span>累计答错 {currentQuestion.reviewState.wrongCount}</span>
                <span>连续答对 {currentQuestion.reviewState.correctStreak}</span>
                {quizMode === "focus" && (
                  <span>重点巩固 {Math.min(currentQuestion.reviewState.focusRecoveryCorrectCount ?? 0, 2)}/2</span>
                )}
              </div>
              <div className="dictionary-title">
                <h3>{currentQuestion.term}</h3>
                <button className="secondary" onClick={() => speakTerm(currentQuestion.term)}>发音</button>
              </div>
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
                      disabled={Boolean(feedback) || answerSubmitting}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              {feedback && (
                <>
                  <QuizResultDetails
                    question={currentQuestion}
                    feedback={feedback}
                    onSpeak={() => speakTerm(currentQuestion.term)}
                  />
                  <button
                    className="question-issue-button"
                    type="button"
                    onClick={() => void reportCurrentQuestionIssue()}
                    disabled={questionIssueReported}
                  >
                    {questionIssueReported ? "已标记待检查" : "题目有问题"}
                  </button>
                </>
              )}
              <div className="quiz-actions">
                <button onClick={() => void nextQuestion()} disabled={!feedback || answerSubmitting}>
                  {nextPendingQuestionIndex < 0 ? "完成本轮" : "下一题"}
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
              <h2>批量导入词汇</h2>
              <p>每行一个词条，释义请使用英文。</p>
            </div>
            <button className="secondary" onClick={() => setImportText(sampleText)}>填入示例</button>
          </div>
          <textarea
            className="import-box"
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder="estoppel - A rule preventing a person from denying something..."
          />
          <div className="import-actions">
            <button onClick={() => void importVocabulary()}>导入</button>
            <button className="secondary" onClick={() => setImportText("")}>清空</button>
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
              <h2>我的词库</h2>
              <p>当前显示 {visibleItems.length}/{items.length} 个词条</p>
            </div>
            <div className="section-actions">
              <button className="secondary" onClick={() => void backfillQuality()}>检查旧词质量</button>
              <button className="secondary" onClick={() => void loadItems()}>刷新</button>
            </div>
          </div>
          {qualityBackfill && (
            <div className="notice success">
              已检查 {qualityBackfill.scanned} 个词条，更新 {qualityBackfill.updated} 个，仍有 {qualityBackfill.needsReview} 个需要确认。
            </div>
          )}
          <div className="filter-bar" aria-label="词库筛选">
            <FilterButton label="明日复习" value={libraryCounts.tomorrow} active={libraryFilter === "tomorrow"} onClick={() => setLibraryFilter("tomorrow")} />
            <FilterButton label="历史答错" value={libraryCounts.wrong} active={libraryFilter === "wrong"} onClick={() => setLibraryFilter("wrong")} />
            <FilterButton label="待确认" value={libraryCounts.needsReview} active={libraryFilter === "needsReview"} onClick={() => setLibraryFilter("needsReview")} />
            <FilterButton label="待进入计划" value={libraryCounts.pending} active={libraryFilter === "pending"} onClick={() => setLibraryFilter("pending")} />
            <FilterButton label="复习中" value={libraryCounts.reviewing} active={libraryFilter === "reviewing"} onClick={() => setLibraryFilter("reviewing")} />
            <FilterButton label="已掌握" value={libraryCounts.mastered} active={libraryFilter === "mastered"} onClick={() => setLibraryFilter("mastered")} />
            <FilterButton label="已移出" value={libraryCounts.retired} active={libraryFilter === "retired"} onClick={() => setLibraryFilter("retired")} />
            <FilterButton label="全部" value={libraryCounts.all} active={libraryFilter === "all"} onClick={() => setLibraryFilter("all")} />
          </div>
          <div className="empty-state">
            {items.length === 0 ? (
              <>
                <p>词库还没有词条。先查词或导入内容后，才能开始词汇管理与复习。</p>
                <div className="quiz-actions">
                  <button className="secondary" onClick={() => setTab("dictionary")}>去查词</button>
                  <button className="secondary" onClick={() => setTab("import")}>批量导入词汇</button>
                </div>
              </>
            ) : visibleItems.length === 0 ? (
              <>
                <p>当前筛选条件（{currentLibraryFilterLabel}）下没有词条。</p>
                <div className="quiz-actions">
                  <button className="secondary" onClick={() => setLibraryFilter("all")}>查看全部词条</button>
                </div>
              </>
            ) : (
              <div className="library-list" role="list">
                {visibleItems.map((item) => editingItemId === item.id && editDraft ? (
                  <article key={item.id} className="library-item is-editing" role="listitem">
                    <EditItemForm
                      draft={editDraft}
                      onChange={setEditDraft}
                      onSave={() => void saveEditedItem(item)}
                      onCancel={cancelEditingItem}
                    />
                  </article>
                ) : (
                  <article key={item.id} className={item.retiredAt ? "library-item is-retired" : "library-item"} role="listitem">
                    <div className="library-item-head">
                      <div className="library-term-group">
                        <strong className="term-cell">{item.term}</strong>
                        <span className="library-stage">{formatLibraryStage(item)}</span>
                        {item.reviewState.focus && <span className="library-focus">重点复习</span>}
                      </div>
                      <LibraryActions
                        item={item}
                        onEdit={() => startEditingItem(item)}
                        onRecheck={() => void recheckItem(item)}
                        onMarkOk={() => void markQualityOk(item)}
                        onRetire={() => void retireLibraryItem(item)}
                      />
                    </div>
                    <p className="library-definition">{item.definition}</p>
                    <div className="library-meta">
                      <span><small>查询记录</small><LookupBadge item={item} /></span>
                      <span><small>释义质量</small><QualityBadge item={item} /></span>
                      <span><small>发音</small><b>{item.phonetic || item.pronunciation || "暂无"}</b></span>
                      <span><small>下次复习</small><b>{item.reviewState.nextReviewAt || "待安排"}</b></span>
                      <span><small>历史答错</small><b>{item.reviewState.wrongCount} 次</b></span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
          )}
        </div>

        <TaskRail
          learningStatus={learningStatus}
          calendar={calendar}
          calendarExpanded={calendarExpanded}
          mobileExpanded={taskRailExpanded}
          progress={dailyPlanProgress}
          completed={dailyPlanCompleted}
          total={dailyPlanTotal}
          remaining={dailyPlanRemaining}
          onToggleCalendar={() => setCalendarExpanded((value) => !value)}
          onToggleMobile={() => setTaskRailExpanded((value) => !value)}
          onMonthChange={(month) => void loadCalendar(month)}
          onStartReview={() => {
            setTaskRailExpanded(false);
            setTab("quiz");
            void loadReview("due");
          }}
          onStartFocus={() => {
            setTaskRailExpanded(false);
            setTab("quiz");
            void loadReview("focus");
          }}
          focusAvailableCount={focusAvailableCount}
        />
      </div>
    </main>
  );
}

function TaskRail({
  learningStatus,
  calendar,
  calendarExpanded,
  mobileExpanded,
  progress,
  completed,
  total,
  remaining,
  onToggleCalendar,
  onToggleMobile,
  onMonthChange,
  onStartReview,
  onStartFocus,
  focusAvailableCount
}: {
  learningStatus: LearningStatus;
  calendar: DailyPlanCalendarResponse | null;
  calendarExpanded: boolean;
  mobileExpanded: boolean;
  progress: number;
  completed: number;
  total: number;
  remaining: number;
  onToggleCalendar: () => void;
  onToggleMobile: () => void;
  onMonthChange: (month: string) => void;
  onStartReview: () => void;
  onStartFocus: () => void;
  focusAvailableCount: number;
}) {
  const complete = total > 0 && remaining === 0;
  const summary = total === 0
    ? "今日暂无任务"
    : complete
      ? `今日 ${completed}/${total} · 已完成`
      : `今日 ${completed}/${total} · 剩余 ${remaining}`;

  return (
    <aside className={`task-rail ${mobileExpanded ? "is-expanded" : ""}`} aria-label="今日任务轨道">
      <div className="task-rail-content">
        <section className={`rail-progress ${complete ? "is-complete" : ""}`}>
          <div className="rail-kicker">
            <span>今日任务</span>
            <strong>{progress}%</strong>
          </div>
          <h2>{summary}</h2>
          <p>
            {total === 0
              ? "今天没有需要完成的到期任务。"
              : complete
                ? "今天的计划已经完整完成。"
                : `完成剩余 ${remaining} 题，记录今天的完整进度。`}
          </p>
          <div className="progress-track" aria-label={`今日任务完成 ${progress}%`}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <button onClick={onStartReview} disabled={total === 0 || complete}>
            {total === 0 ? "今日暂无任务" : complete ? "今日任务已完成" : completed > 0 ? "继续今日复习" : "开始今日复习"}
          </button>
        </section>

        {calendar && (
          <DailyPlanCalendar
            calendar={calendar}
            expanded={calendarExpanded}
            onToggle={onToggleCalendar}
            onMonthChange={onMonthChange}
          />
        )}

        <section className="rail-stats" aria-label="学习概况">
          <div><span>连续完成</span><strong>{learningStatus.dailyTestStreakDays} 天</strong></div>
          <div><span>词库累计</span><strong>{learningStatus.total}</strong></div>
        </section>

        {focusAvailableCount > 0 && (
          <button className="rail-focus" onClick={onStartFocus}>
            <span>重点复习</span>
            <strong>{focusAvailableCount} 个词</strong>
          </button>
        )}
      </div>

      <button
        className="task-rail-mobile-toggle"
        type="button"
        onClick={onToggleMobile}
        aria-expanded={mobileExpanded}
      >
        <span>
          <small>今日任务</small>
          <strong>{summary}</strong>
        </span>
        <span aria-hidden="true">{mobileExpanded ? "收起" : "查看"}</span>
      </button>
    </aside>
  );
}

function DailyPlanCalendar({
  calendar,
  expanded,
  onToggle,
  onMonthChange
}: {
  calendar: DailyPlanCalendarResponse;
  expanded: boolean;
  onToggle: () => void;
  onMonthChange: (month: string) => void;
}) {
  const monthCells = buildMonthGrid(calendar.monthDays);

  return (
    <section className="completion-calendar" aria-label="每日完成日历">
      <div className="calendar-heading">
        <div>
          <p className="eyebrow">完成记录</p>
          <h2>最近 7 天</h2>
        </div>
        <button
          className="secondary compact calendar-toggle"
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {expanded ? "收起月历" : "查看整月"}
        </button>
      </div>

      <div className="recent-calendar" role="list">
        {calendar.recentDays.map((day) => (
          <CalendarDay key={day.date} day={day} today={calendar.today} compact />
        ))}
      </div>

      {expanded && (
        <div className="month-calendar">
          <div className="month-toolbar">
            <button
              className="secondary compact month-arrow"
              type="button"
              aria-label="上个月"
              title="上个月"
              onClick={() => onMonthChange(shiftMonth(calendar.month, -1))}
            >
              ‹
            </button>
            <strong>{formatMonthTitle(calendar.month)}</strong>
            <button
              className="secondary compact month-arrow"
              type="button"
              aria-label="下个月"
              title="下个月"
              onClick={() => onMonthChange(shiftMonth(calendar.month, 1))}
            >
              ›
            </button>
          </div>
          <div className="month-weekdays" aria-hidden="true">
            {["一", "二", "三", "四", "五", "六", "日"].map((label) => <span key={label}>{label}</span>)}
          </div>
          <div className="month-grid" role="grid" aria-label={formatMonthTitle(calendar.month)}>
            {monthCells.map((day, index) => day
              ? <CalendarDay key={day.date} day={day} today={calendar.today} />
              : <span className="month-placeholder" key={`empty-${index}`} aria-hidden="true" />)}
          </div>
        </div>
      )}
    </section>
  );
}

function CalendarDay({
  day,
  today,
  compact = false
}: {
  day: DailyPlanCalendarDay;
  today: string;
  compact?: boolean;
}) {
  const date = new Date(`${day.date}T00:00:00Z`);
  const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "short", timeZone: "UTC" })
    .format(date)
    .replace("周", "");
  const dayNumber = Number(day.date.slice(-2));
  const label = `${day.date}，${calendarStatusLabel(day)}${day.date === today ? "，今天" : ""}`;
  const markerKind = calendarMarkerKind(day, today);

  return (
    <div
      className={[
        "calendar-day",
        `calendar-${day.status}`,
        compact ? "calendar-compact" : "",
        day.date === today ? "calendar-today" : ""
      ].filter(Boolean).join(" ")}
      role={compact ? "listitem" : "gridcell"}
      aria-label={label}
      title={label}
    >
      {compact && <span className="calendar-weekday">{weekday}</span>}
      <span className="calendar-date">{dayNumber}</span>
      {markerKind === "none"
        ? <span className="calendar-mark" aria-hidden="true" />
        : (
          <span className={`calendar-mark calendar-mark-${markerKind}`} aria-hidden="true">
            <img
              alt=""
              src={markerKind === "front"
                ? "/assets/dawang-calendar-front.png"
                : "/assets/dawang-calendar-back.png"}
            />
          </span>
        )}
    </div>
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
  if (item.retiredAt) {
    return (
      <span className="quality-badge retired" title={item.retiredReason || "已移出学习与测试。"}>
        已移出
      </span>
    );
  }
  const quality = item.lookupQuality;
  const label = item.sourceLabel ? formatSourceLabel(item.sourceLabel) : (quality ? formatLookupQuality(quality) : "手动导入");
  const needsReview = needsDefinitionReview(item);

  return (
    <span
      className={needsReview ? "quality-badge needs-review" : "quality-badge"}
      title={item.lookupWarning ? formatLookupWarning(item.lookupWarning) : label}
    >
      {needsReview ? "需要确认" : label}
    </span>
  );
}

function LookupBadge({ item }: { item: VocabItem }) {
  const count = item.lookupStats?.count ?? 0;
  const historyLabel = item.lookupStats?.historicalCountKnown
    ? `累计主动查询 ${count} 次`
    : count > 0
      ? `新版上线后主动查询 ${count} 次；旧查询记录未知`
      : "旧查询记录未知；新版上线后尚未查询";

  return (
    <span
      className={item.isImportant ? "lookup-badge important" : "lookup-badge"}
      title={historyLabel}
    >
      {item.isImportant ? `重要 · ${count} 次` : count > 0 ? `${count} 次` : "历史未知"}
    </span>
  );
}

function LibraryActions({
  item,
  onEdit,
  onRecheck,
  onMarkOk,
  onRetire
}: {
  item: VocabItem;
  onEdit: () => void;
  onRecheck: () => void;
  onMarkOk: () => void;
  onRetire: () => void;
}) {
  const needsReview = needsDefinitionReview(item);

  return (
    <div className="library-actions">
      {!item.retiredAt && <button className="secondary compact" onClick={onEdit}>编辑</button>}
      {!item.retiredAt && needsReview && <button className="secondary compact" onClick={onRecheck}>重新查询</button>}
      {!item.retiredAt && needsReview && <button className="secondary compact" onClick={onMarkOk}>确认无误</button>}
      {!item.retiredAt && <button className="secondary compact danger" onClick={onRetire}>移出学习</button>}
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
        <span>词汇</span>
        <input value={draft.term} onChange={(event) => update("term", event.target.value)} />
      </label>
      <label>
        <span>英文释义</span>
        <textarea value={draft.definition} onChange={(event) => update("definition", event.target.value)} />
      </label>
      <label>
        <span>中文</span>
        <textarea value={draft.chineseDefinition} onChange={(event) => update("chineseDefinition", event.target.value)} />
      </label>
      <label>
        <span>法律语境</span>
        <textarea value={draft.legalContext} onChange={(event) => update("legalContext", event.target.value)} />
      </label>
      <div className="edit-grid">
        <label>
          <span>音标</span>
          <input value={draft.phonetic} onChange={(event) => update("phonetic", event.target.value)} />
        </label>
        <label>
          <span>发音标注</span>
          <input value={draft.pronunciation} onChange={(event) => update("pronunciation", event.target.value)} />
        </label>
      </div>
      <div className="quiz-actions">
        <button onClick={onSave}>保存</button>
        <button className="secondary" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

function formatLookupQuality(quality: NonNullable<DictionaryResult["lookupQuality"]>): string {
  if (quality === "ai-legal") return "AI 法律释义";
  if (quality === "legal-glossary") return "法律词典";
  if (quality === "saved") return "已保存";
  if (quality === "reference") return "参考资料";
  return "备用释义";
}

function formatSourceLabel(label?: string): string {
  if (!label) return "法律英语检索";
  return {
    "Saved review item": "已保存词条",
    "Fallback dictionary": "备用在线词典",
    "Built-in legal glossary": "法律术语表",
    "Legal glossary": "法律术语表",
    "Reference fallback": "参考资料",
    "AI legal dictionary": "AI 法律词典"
  }[label] ?? label;
}

function formatLookupWarning(warning: string): string {
  return {
    "This old entry looks like a reference summary or non-legal result. Review before using it in quizzes.": "这个旧词条可能是参考摘要或非法律释义，请确认后再用于测试。",
    "This old entry was saved before quality tracking. Review its legal meaning before relying on it.": "这个旧词条保存于质量检查启用之前，请确认其法律含义。",
    "This is a fallback definition. Legal meaning may need AI legal lookup.": "当前为备用释义，法律含义可能需要进一步检索确认。",
    "This is a reference summary, not a concise dictionary definition.": "当前内容是参考摘要，并非精炼的词典释义。"
  }[warning] ?? warning;
}

function LegalNotePanel({ note }: { note: LegalEnglishNote }) {
  return (
    <section className="legal-note">
      <div>
        <h4>法律英语</h4>
        <p className="chinese-meaning">{note.chineseMeaning}</p>
      </div>
      <p>{note.legalRegister}</p>
      <p>{note.contextExplanation}</p>
      {note.pattern && <p><strong>常用结构：</strong> {note.pattern}</p>}
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

function QuizResultDetails({
  question,
  feedback,
  onSpeak
}: {
  question: ReviewQuestion;
  feedback: AnswerFeedback;
  onSpeak: () => void;
}) {
  const details = quizResultFallbacks(question);
  return (
    <section className="quiz-result-details" aria-label="答题结果与词汇说明">
      <div className={`notice ${feedback.isCorrect ? "success" : "error"}`}>
        {feedback.isCorrect ? "回答正确。" : `回答错误。正确释义：${feedback.correctDefinition}`}
      </div>
      <div className="quiz-result-heading">
        <div>
          <strong>{question.term}</strong>
          {question.phonetic && <span>{question.phonetic}</span>}
        </div>
        <button className="secondary compact" onClick={onSpeak}>发音</button>
      </div>
      <div className="quiz-result-block">
        <span>法律语境</span>
        <p className={!details.hasLegalContext ? "muted" : ""}>{details.legalContext}</p>
      </div>
      <div className="quiz-result-block">
        <span>例句</span>
        {details.hasExamples ? (
          <div className="quiz-result-examples">
            {details.examples.map((example) => (
              <article key={example.sentence}>
                <p>{example.sentence}</p>
                {example.translation && <small>{example.translation}</small>}
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">暂无例句</p>
        )}
      </div>
    </section>
  );
}

function getQuizResultFixtureMode(): QuizResultFixtureMode | null {
  if (!import.meta.env.DEV) return null;
  const value = new URLSearchParams(window.location.search).get("quizResultFixture");
  return value === "correct" || value === "wrong" || value === "missing" ? value : null;
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
        <span>新增</span>
        <strong>{result.imported}</strong>
        <span>更新</span>
        <strong>{result.updated}</strong>
        <span>失败</span>
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
              第 {failure.line} 行：{failure.reason}
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
    throw new Error("本地学习服务尚未启动。请先从桌面打开“大王查词”，然后重试。");
  }
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "请求失败，请稍后重试。");
  }

  return data as T;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function createLookupEvent(source: LookupSource, eventId: string = crypto.randomUUID()): LookupEvent {
  return {
    eventId,
    source,
    occurredAt: new Date().toISOString()
  };
}

function parseLookupSource(value: string | null): LookupSource | null {
  return value === "web"
    || value === "extension-selection"
    || value === "extension-image"
    || value === "desktop-image"
    ? value
    : null;
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

function matchesLibraryFilter(item: VocabItem, filter: LibraryFilter, nextLearningDate: string): boolean {
  if (filter === "all") return true;
  if (filter === "retired") return Boolean(item.retiredAt);
  if (item.retiredAt) return false;
  if (filter === "needsReview") return needsDefinitionReview(item);
  if (filter === "tomorrow") return Boolean(nextLearningDate) && item.reviewState.nextReviewAt === nextLearningDate;
  if (filter === "wrong") return isWrongQueueItem(item);
  if (filter === "pending") return !item.reviewState.lastReviewedAt;
  if (filter === "reviewing") return Boolean(item.reviewState.lastReviewedAt) && item.reviewState.status !== "mastered";
  return item.reviewState.status === "mastered";
}

function getLibraryCounts(items: VocabItem[], nextLearningDate: string) {
  const activeItems = items.filter((item) => !item.retiredAt);
  return {
    needsReview: activeItems.filter(needsDefinitionReview).length,
    tomorrow: nextLearningDate
      ? activeItems.filter((item) => item.reviewState.nextReviewAt === nextLearningDate).length
      : 0,
    wrong: activeItems.filter(isWrongQueueItem).length,
    pending: activeItems.filter((item) => !item.reviewState.lastReviewedAt).length,
    reviewing: activeItems.filter((item) =>
      Boolean(item.reviewState.lastReviewedAt) && item.reviewState.status !== "mastered"
    ).length,
    mastered: activeItems.filter((item) => item.reviewState.status === "mastered").length,
    retired: items.length - activeItems.length,
    all: items.length
  };
}

function isWrongQueueItem(item: VocabItem): boolean {
  return item.reviewState.wrongCount > 0 && item.reviewState.status !== "mastered";
}

function needsDefinitionReview(item: VocabItem): boolean {
  if (item.retiredAt) return false;
  if (item.questionQuality) {
    return item.questionQuality.status === "pending-review";
  }
  return item.lookupQuality === "dictionary" || item.lookupQuality === "reference";
}

function quizTitle(mode: QuizMode): string {
  return {
    due: "今日到期任务",
    wrong: "错题复习",
    focus: "重点复习",
    all: "全部词汇练习"
  }[mode];
}

function quizStatus(mode: QuizMode): string {
  return {
    due: "正在复习到期词汇",
    wrong: "正在复习错题",
    focus: "正在复习重点词",
    all: "正在练习全部词汇"
  }[mode];
}

function formatReviewStatus(status: ReviewStatus): string {
  return {
    new: "新词",
    learning: "学习中",
    review: "复习中",
    mastered: "已掌握"
  }[status];
}

function libraryFilterLabel(filter: LibraryFilter): string {
  return {
    tomorrow: "明日复习",
    wrong: "历史答错",
    needsReview: "待确认",
    pending: "待进入计划",
    reviewing: "复习中",
    mastered: "已掌握",
    retired: "已移出",
    all: "全部"
  }[filter];
}

function formatLibraryStage(item: VocabItem): string {
  if (item.retiredAt) return "已移出学习";
  if (!item.reviewState.lastReviewedAt) return "待进入计划";
  return formatReviewStatus(item.reviewState.status);
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
