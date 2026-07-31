import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { goalTracks, knowledgeTypes, subjects } from "../shared/taxonomy";
import type {
  CaptureMode,
  CaptureResponse,
  Classification,
  GoalTrack,
  LastActionResponse,
  LearningSession,
  SessionClosure
} from "../shared/types";
import "./styles.css";

type Status = "idle" | "capturing" | "closing" | "ready" | "saving" | "saved" | "error";

type LearningStatus = {
  todayAdded: number;
  dueToday: number;
  learningStreakDays: number;
  dailyTestStreakDays: number;
  masteryRate: number;
  total: number;
  repeatedWrong: number;
};

const apiBaseUrl = "http://localhost:3333";

function Popup() {
  const [status, setStatus] = useState<Status>("idle");
  const [goal, setGoal] = useState("");
  const [primaryGoalTrack, setPrimaryGoalTrack] = useState<GoalTrack>("LLM");
  const [subject, setSubject] = useState("Canadian Constitutional Law");
  const [manualText, setManualText] = useState("");
  const [session, setSession] = useState<LearningSession | null>(null);
  const [closure, setClosure] = useState<SessionClosure | null>(null);
  const [originalClassification, setOriginalClassification] = useState<Classification | null>(null);
  const [lastAction, setLastAction] = useState<LastActionResponse | null>(null);
  const [error, setError] = useState("");
  const [savedPath, setSavedPath] = useState("");
  const [learningStatus, setLearningStatus] = useState<LearningStatus | null>(null);

  useEffect(() => {
    loadLastAction();
    loadLearningStatus();
  }, []);

  const subjectOptions = subjects[primaryGoalTrack];

  const statusText = useMemo(() => {
    if (status === "idle") return session ? "已获取学习内容" : "准备好了";
    if (status === "capturing") return "正在获取学习内容";
    if (status === "closing") return "正在整理学习收尾";
    if (status === "ready") return "学习收尾已生成";
    if (status === "saving") return "正在保存笔记";
    if (status === "saved") return "已保存";
    return "需要处理";
  }, [session, status]);

  function updatePrimaryGoalTrack(nextTrack: GoalTrack) {
    setPrimaryGoalTrack(nextTrack);
    setSubject(subjects[nextTrack][0]);
    setClosure(null);
    setOriginalClassification(null);
  }

  async function loadLastAction() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/last-action`);
      if (response.ok) {
        setLastAction(await response.json());
      }
    } catch {
      setLastAction(null);
    }
  }

  async function loadLearningStatus() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/vocab/learning-status`, { cache: "no-store" });
      setLearningStatus(response.ok ? await response.json() : null);
    } catch {
      setLearningStatus(null);
    }
  }

  async function openTodayReview() {
    const response = await chrome.runtime.sendMessage({ type: "VOCAB_OPEN_TODAY_REVIEW" }) as { ok?: boolean; error?: string };
    if (!response?.ok) {
      showError(new Error(response?.error || "请先从桌面打开“大王查词”，然后重试。"));
    }
  }

  async function capture(mode: CaptureMode) {
    setStatus("capturing");
    setError("");
    setSavedPath("");
    setClosure(null);
    setOriginalClassification(null);

    try {
      const response = (await chrome.runtime.sendMessage({
        type: "REQUEST_CAPTURE",
        mode,
        goal,
        primaryGoalTrack,
        subject
      })) as CaptureResponse;

      if (!response.ok) {
        throw new Error(response.error);
      }

      setSession(response.session);
      setStatus("idle");
    } catch (err) {
      showError(err);
    }
  }

  function captureManualText() {
    const text = manualText.trim();
    if (!text) {
      setError("请先粘贴学习内容。");
      setStatus("error");
      return;
    }

    setSession({
      id: crypto.randomUUID(),
      goal: goal.trim() || undefined,
      primaryGoalTrack,
      subject,
      sourceType: "manual",
      title: subject,
      capturedAt: new Date().toISOString(),
      rawText: text.slice(0, 80_000)
    });
    setClosure(null);
    setOriginalClassification(null);
    setSavedPath("");
    setStatus("idle");
    setError("");
  }

  async function createClosure() {
    if (!session) {
      setError("请先获取网页内容或粘贴学习材料。");
      setStatus("error");
      return;
    }

    setStatus("closing");
    setError("");

    try {
      const requestSession = buildCurrentSession(session);
      const response = await fetch(`${apiBaseUrl}/api/closure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestSession)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "生成学习收尾失败。");
      }

      setSession(requestSession);
      setClosure(data);
      setOriginalClassification(data.classification);
      setStatus("ready");
    } catch (err) {
      showError(err);
    }
  }

  async function saveClosure() {
    if (!session || !closure) {
      setError("请先生成学习收尾，再保存。");
      setStatus("error");
      return;
    }

    setStatus("saving");
    setError("");

    try {
      const savedSession = buildCurrentSession(session);
      const response = await fetch(`${apiBaseUrl}/api/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: savedSession,
          closure,
          originalClassification
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "保存失败。");
      }

      setSavedPath(data.markdownPath ?? "");
      setStatus("saved");
      await loadLastAction();
    } catch (err) {
      showError(err);
    }
  }

  function buildCurrentSession(base: LearningSession): LearningSession {
    return {
      ...base,
      goal: goal.trim() || base.goal,
      primaryGoalTrack,
      subject
    };
  }

  function updateClassification(nextClassification: Classification) {
    if (!closure) return;
    setClosure({
      ...closure,
      classification: {
        ...nextClassification,
        primaryGoalTrack,
        subject,
        reviewStatus: "reviewed"
      }
    });
  }

  function showError(err: unknown) {
    setError(err instanceof Error ? err.message : "操作失败，请稍后重试。");
    setStatus("error");
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>学习收尾助手</h1>
          <p>{statusText}</p>
        </div>
        <span className={`status status-${status}`}>{formatStatus(status)}</span>
      </header>

      <section className="vocab-summary">
        <div>
          <strong>{learningStatus?.dueToday ?? "–"}</strong>
          <span>待复习</span>
        </div>
        <div>
          <strong>{learningStatus?.todayAdded ?? "–"}</strong>
          <span>今日新增</span>
        </div>
        <div>
          <strong>{learningStatus?.repeatedWrong ?? "–"}</strong>
          <span>重点复习</span>
        </div>
        <div>
          <strong>{learningStatus ? `${learningStatus.dailyTestStreakDays ?? 0}天` : "–"}</strong>
          <span>连续完成</span>
        </div>
        <button onClick={() => void openTodayReview()}>继续完成今日任务</button>
      </section>

      {lastAction?.hasLastAction && (
        <section className="last-action">
          <div className="label">继续上次学习</div>
          <h2>{lastAction.lastTitle || "上次学习内容"}</h2>
          {lastAction.nextActions.map((item) => (
            <p key={item.action}><strong>{item.action}</strong> {item.reason}</p>
          ))}
        </section>
      )}

      <section className="field">
        <label htmlFor="primaryGoalTrack">主要目标</label>
        <select
          id="primaryGoalTrack"
          value={primaryGoalTrack}
          onChange={(event) => updatePrimaryGoalTrack(event.target.value as GoalTrack)}
        >
          {goalTracks.map((track) => <option key={track} value={track}>{track}</option>)}
        </select>

        <label htmlFor="subject">学习主题</label>
        <select id="subject" value={subject} onChange={(event) => setSubject(event.target.value)}>
          {subjectOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>

        <label htmlFor="goal">本次学习目标</label>
        <input
          id="goal"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="NCA / Canadian Constitutional Law"
        />
      </section>

      <section className="source">
        <div className="label">本次学习内容</div>
        <h2>{session?.title || "尚未获取学习内容"}</h2>
        <p>{session?.url || session?.sourceType || "可获取当前网页、选中文字，或手动粘贴内容。"}</p>
        {session && <p>已获取 {session.rawText.length.toLocaleString()} 个字符</p>}
      </section>

      <div className="actions">
        <button onClick={() => capture("page")} disabled={isBusy(status)}>获取当前网页</button>
        <button onClick={() => capture("selection")} disabled={isBusy(status)}>获取选中文字</button>
      </div>

      <section className="field">
        <label htmlFor="manualText">手动粘贴</label>
        <textarea
          id="manualText"
          value={manualText}
          onChange={(event) => setManualText(event.target.value)}
          placeholder="在这里粘贴课程文字、笔记或其他学习内容。"
        />
        <button onClick={captureManualText} disabled={isBusy(status)}>使用粘贴内容</button>
      </section>

      <div className="actions">
        <button onClick={createClosure} disabled={!session || isBusy(status)}>生成学习收尾</button>
        <button onClick={saveClosure} disabled={!closure || isBusy(status)}>保存笔记</button>
      </div>

      {error && <div className="notice error">{error}</div>}
      {savedPath && <div className="notice success">已保存至 {savedPath}</div>}

      <ClosurePreview closure={closure} onClassificationChange={updateClassification} />
    </main>
  );
}

function ClosurePreview({
  closure,
  onClassificationChange
}: {
  closure: SessionClosure | null;
  onClassificationChange: (classification: Classification) => void;
}) {
  if (!closure) {
    return <p className="empty">学习收尾内容会显示在这里。</p>;
  }

  return (
    <section className="closure">
      <ClassificationPanel classification={closure.classification} onChange={onClassificationChange} />

      <article className="panel">
        <h2>学习摘要</h2>
        <p>{closure.summary}</p>
      </article>

      <ListPanel title="核心收获" items={closure.keyTakeaways} />

      <section className="cards">
        <h2>知识卡片</h2>
        {closure.knowledgeCards.map((card) => (
          <article className="card" key={card.title}>
            <h3>{card.title}</h3>
            <p>{card.summary}</p>
            <div className="tags">{card.tags.map((tag) => <span key={tag}>#{tag.replace(/^#/, "")}</span>)}</div>
          </article>
        ))}
      </section>

      <ListPanel title="待解决问题" items={closure.unresolvedQuestions} />

      <section className="panel">
        <h2>下一步行动</h2>
        {closure.nextActions.map((item) => (
          <p key={item.action}><strong>{item.action}</strong> {item.reason}</p>
        ))}
      </section>

      <div className="tags suggested">
        {closure.suggestedTags.map((tag) => <span key={tag}>#{tag.replace(/^#/, "")}</span>)}
      </div>
    </section>
  );
}

function ClassificationPanel({
  classification,
  onChange
}: {
  classification: Classification;
  onChange: (classification: Classification) => void;
}) {
  const confidenceClass = classification.classificationConfidence < 0.6
    ? "danger"
    : classification.classificationConfidence < 0.8
      ? "warning"
      : "ok";

  function patch(next: Partial<Classification>) {
    onChange({ ...classification, ...next });
  }

  return (
    <section className="panel classification">
      <h2>内容分类</h2>
      {classification.classificationConfidence < 0.6 && (
        <div className="notice error">暂时无法确定这条内容的分类，请确认后再保存。</div>
      )}
      {classification.classificationConfidence >= 0.6 && classification.classificationConfidence < 0.8 && (
        <div className="notice warning">建议检查分类。</div>
      )}

      <ReadonlyRow label="主要目标" value={classification.primaryGoalTrack} />
      <ReadonlyRow label="学习主题" value={classification.subject} />

      <label>主题</label>
      <input value={classification.topic} onChange={(event) => patch({ topic: event.target.value })} />

      <label>子主题</label>
      <input value={classification.subtopics.join(", ")} onChange={(event) => patch({ subtopics: splitList(event.target.value) })} />

      <label>次要目标</label>
      <input value={classification.secondaryGoalTracks.join(", ")} onChange={(event) => patch({ secondaryGoalTracks: splitGoalTracks(event.target.value) })} />

      <label>相关主题</label>
      <input value={classification.relatedSubjects.join(", ")} onChange={(event) => patch({ relatedSubjects: splitList(event.target.value) })} />

      <label>知识类型</label>
      <select
        multiple
        value={classification.knowledgeTypes}
        onChange={(event) => patch({ knowledgeTypes: Array.from(event.currentTarget.selectedOptions).map((option) => option.value) })}
      >
        {knowledgeTypes.map((type) => <option key={type} value={type}>{type}</option>)}
      </select>

      <label>法域</label>
      <input value={classification.jurisdiction || ""} onChange={(event) => patch({ jurisdiction: event.target.value })} />

      <ReadonlyRow label="分类置信度" value={`${Math.round(classification.classificationConfidence * 100)}%`} className={confidenceClass} />
      <ReadonlyRow label="分类理由" value={classification.classificationReason} />
      <ReadonlyRow label="确认状态" value={classification.reviewStatus} />
    </section>
  );
}

function ReadonlyRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="classification-row">
      <span>{label}</span>
      <strong className={className}>{value || "无"}</strong>
    </div>
  );
}

function ListPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {items.length ? <ol>{items.map((item) => <li key={item}>{item}</li>)}</ol> : <p>暂无内容。</p>}
    </section>
  );
}

function splitList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function splitGoalTracks(value: string): GoalTrack[] {
  return splitList(value).filter((item): item is GoalTrack => goalTracks.includes(item as GoalTrack));
}

function isBusy(status: Status): boolean {
  return status === "capturing" || status === "closing" || status === "saving";
}

function formatStatus(status: Status): string {
  return {
    idle: "就绪",
    capturing: "获取中",
    closing: "整理中",
    ready: "待确认",
    saving: "保存中",
    saved: "已保存",
    error: "需处理"
  }[status];
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
