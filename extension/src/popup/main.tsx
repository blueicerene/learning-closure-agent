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

  useEffect(() => {
    loadLastAction();
  }, []);

  const subjectOptions = subjects[primaryGoalTrack];

  const statusText = useMemo(() => {
    if (status === "idle") return session ? "Session captured" : "Ready";
    if (status === "capturing") return "Capturing session";
    if (status === "closing") return "Generating closure";
    if (status === "ready") return "Closure ready";
    if (status === "saving") return "Saving Markdown";
    if (status === "saved") return "Saved";
    return "Needs attention";
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
      setError("Paste some learning text first.");
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
      setError("Capture or paste a learning session first.");
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
        throw new Error(data?.error || "Closure failed");
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
      setError("Generate a closure before saving.");
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
        throw new Error(data?.error || "Save failed");
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
    setError(err instanceof Error ? err.message : "Something went wrong");
    setStatus("error");
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>Learning Closure</h1>
          <p>{statusText}</p>
        </div>
        <span className={`status status-${status}`}>{status}</span>
      </header>

      {lastAction?.hasLastAction && (
        <section className="last-action">
          <div className="label">Continue from last session?</div>
          <h2>{lastAction.lastTitle || "Previous session"}</h2>
          {lastAction.nextActions.map((item) => (
            <p key={item.action}><strong>{item.action}</strong> {item.reason}</p>
          ))}
        </section>
      )}

      <section className="field">
        <label htmlFor="primaryGoalTrack">Primary Goal Track</label>
        <select
          id="primaryGoalTrack"
          value={primaryGoalTrack}
          onChange={(event) => updatePrimaryGoalTrack(event.target.value as GoalTrack)}
        >
          {goalTracks.map((track) => <option key={track} value={track}>{track}</option>)}
        </select>

        <label htmlFor="subject">Subject</label>
        <select id="subject" value={subject} onChange={(event) => setSubject(event.target.value)}>
          {subjectOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>

        <label htmlFor="goal">Learning goal</label>
        <input
          id="goal"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="NCA / Canadian Constitutional Law"
        />
      </section>

      <section className="source">
        <div className="label">Captured Session</div>
        <h2>{session?.title || "No session captured yet"}</h2>
        <p>{session?.url || session?.sourceType || "Capture the active tab, selected text, or paste manually."}</p>
        {session && <p>{session.rawText.length.toLocaleString()} characters captured</p>}
      </section>

      <div className="actions">
        <button onClick={() => capture("page")} disabled={isBusy(status)}>Capture Current Page</button>
        <button onClick={() => capture("selection")} disabled={isBusy(status)}>Capture Selected Text</button>
      </div>

      <section className="field">
        <label htmlFor="manualText">Manual paste</label>
        <textarea
          id="manualText"
          value={manualText}
          onChange={(event) => setManualText(event.target.value)}
          placeholder="Paste transcript, notes, or copied study text here."
        />
        <button onClick={captureManualText} disabled={isBusy(status)}>Use Pasted Text</button>
      </section>

      <div className="actions">
        <button onClick={createClosure} disabled={!session || isBusy(status)}>Generate Closure</button>
        <button onClick={saveClosure} disabled={!closure || isBusy(status)}>Save</button>
      </div>

      {error && <div className="notice error">{error}</div>}
      {savedPath && <div className="notice success">Saved to {savedPath}</div>}

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
    return <p className="empty">Learning closure preview will appear here.</p>;
  }

  return (
    <section className="closure">
      <ClassificationPanel classification={closure.classification} onChange={onClassificationChange} />

      <article className="panel">
        <h2>Session Summary</h2>
        <p>{closure.summary}</p>
      </article>

      <ListPanel title="Key Takeaways" items={closure.keyTakeaways} />

      <section className="cards">
        <h2>Knowledge Cards</h2>
        {closure.knowledgeCards.map((card) => (
          <article className="card" key={card.title}>
            <h3>{card.title}</h3>
            <p>{card.summary}</p>
            <div className="tags">{card.tags.map((tag) => <span key={tag}>#{tag.replace(/^#/, "")}</span>)}</div>
          </article>
        ))}
      </section>

      <ListPanel title="Unresolved Questions" items={closure.unresolvedQuestions} />

      <section className="panel">
        <h2>Next Actions</h2>
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
      <h2>Classification</h2>
      {classification.classificationConfidence < 0.6 && (
        <div className="notice error">Agent 不确定这条内容应该归到哪里，请确认分类后再保存。</div>
      )}
      {classification.classificationConfidence >= 0.6 && classification.classificationConfidence < 0.8 && (
        <div className="notice warning">建议检查分类。</div>
      )}

      <ReadonlyRow label="Primary" value={classification.primaryGoalTrack} />
      <ReadonlyRow label="Subject" value={classification.subject} />

      <label>Topic</label>
      <input value={classification.topic} onChange={(event) => patch({ topic: event.target.value })} />

      <label>Subtopics</label>
      <input value={classification.subtopics.join(", ")} onChange={(event) => patch({ subtopics: splitList(event.target.value) })} />

      <label>Secondary</label>
      <input value={classification.secondaryGoalTracks.join(", ")} onChange={(event) => patch({ secondaryGoalTracks: splitGoalTracks(event.target.value) })} />

      <label>Related Subjects</label>
      <input value={classification.relatedSubjects.join(", ")} onChange={(event) => patch({ relatedSubjects: splitList(event.target.value) })} />

      <label>Knowledge Types</label>
      <select
        multiple
        value={classification.knowledgeTypes}
        onChange={(event) => patch({ knowledgeTypes: Array.from(event.currentTarget.selectedOptions).map((option) => option.value) })}
      >
        {knowledgeTypes.map((type) => <option key={type} value={type}>{type}</option>)}
      </select>

      <label>Jurisdiction</label>
      <input value={classification.jurisdiction || ""} onChange={(event) => patch({ jurisdiction: event.target.value })} />

      <ReadonlyRow label="Confidence" value={`${Math.round(classification.classificationConfidence * 100)}%`} className={confidenceClass} />
      <ReadonlyRow label="Reason" value={classification.classificationReason} />
      <ReadonlyRow label="Review Status" value={classification.reviewStatus} />
    </section>
  );
}

function ReadonlyRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="classification-row">
      <span>{label}</span>
      <strong className={className}>{value || "None"}</strong>
    </div>
  );
}

function ListPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {items.length ? <ol>{items.map((item) => <li key={item}>{item}</li>)}</ol> : <p>None captured.</p>}
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

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
