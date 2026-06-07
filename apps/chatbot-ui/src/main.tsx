import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { Bot, Braces, ChevronDown, ExternalLink, FileClock, FileText, Layers, Route, Send } from "lucide-react";
import type { ChatQuestionResponse, ModelCatalog } from "@doc-ai/api-contracts";
import { askQuestion, documentViewUrl, getModelCatalog } from "./api/wrapperClient";
import "./styles.css";

const rootRoute = createRootRoute({
  component: ChatPage
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ChatPage
});

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute])
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function ChatPage() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [question, setQuestion] = useState("What is the premium for policy POL-1001?");
  const [policyNumber, setPolicyNumber] = useState("POL-1001");
  const [documentScope, setDocumentScope] = useState<"minimum" | "all">("minimum");
  const [fetchStrategy, setFetchStrategy] = useState<"vector-only" | "delta-only" | "latest">("latest");
  const [selectedOcrModelName, setSelectedOcrModelName] = useState("");
  const [selectedAgentModelName, setSelectedAgentModelName] = useState("");
  const [answer, setAnswer] = useState<ChatQuestionResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getModelCatalog()
      .then((nextCatalog) => {
        setCatalog(nextCatalog);
        setSelectedOcrModelName(nextCatalog.defaults.ocrModelName);
        setSelectedAgentModelName(nextCatalog.defaults.agentModelName);
      })
      .catch((error: unknown) => {
        setCatalogError(error instanceof Error ? error.message : "Model catalog failed to load");
      });
  }, []);

  const submitDisabled = useMemo(
    () => busy || !catalog || !selectedOcrModelName || !selectedAgentModelName || !question.trim(),
    [busy, catalog, question, selectedAgentModelName, selectedOcrModelName]
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!catalog) return;
    setBusy(true);
    setMessage("");
    setAnswer(null);
    try {
      const response = await askQuestion({
        question,
        policyNumber: policyNumber || undefined,
        documentScope,
        fetchStrategy,
        selectedOcrModelName,
        selectedAgentModelName
      });
      setAnswer(response);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Question failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="chat-shell">
      <section className="conversation">
        <header className="topline">
          <div>
            <p className="eyebrow">Future state</p>
            <h1>Document AI Chatbot</h1>
          </div>
          <span className="status-chip">
            <Bot size={16} /> Wrapper API
          </span>
        </header>

        <form className="question-panel" onSubmit={onSubmit}>
          {catalogError ? <p className="error-line">{catalogError}</p> : null}
          <label>
            Question
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={4} />
          </label>
          <div className="control-grid">
            <label>
              Policy number
              <input value={policyNumber} onChange={(event) => setPolicyNumber(event.target.value)} />
            </label>
            <label>
              OCR model
              <select value={selectedOcrModelName} onChange={(event) => setSelectedOcrModelName(event.target.value)}>
                {catalog?.dropdowns.ocr.models.map((model) => (
                  <option key={model.name} value={model.name}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Agent model
              <select value={selectedAgentModelName} onChange={(event) => setSelectedAgentModelName(event.target.value)}>
                {catalog?.dropdowns.agent.models.map((model) => (
                  <option key={model.name} value={model.name}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="segmented-row" aria-label="Document and fetch controls">
            <button
              className={documentScope === "minimum" ? "selected" : ""}
              type="button"
              onClick={() => setDocumentScope("minimum")}
            >
              <Layers size={16} /> Minimum
            </button>
            <button className={documentScope === "all" ? "selected" : ""} type="button" onClick={() => setDocumentScope("all")}>
              <Layers size={16} /> All
            </button>
            <button
              className={fetchStrategy === "vector-only" ? "selected" : ""}
              type="button"
              onClick={() => setFetchStrategy("vector-only")}
            >
              <Braces size={16} /> Vector
            </button>
            <button
              className={fetchStrategy === "delta-only" ? "selected" : ""}
              type="button"
              onClick={() => setFetchStrategy("delta-only")}
            >
              <FileClock size={16} /> Delta
            </button>
            <button
              className={fetchStrategy === "latest" ? "selected" : ""}
              type="button"
              onClick={() => setFetchStrategy("latest")}
            >
              <FileClock size={16} /> Latest
            </button>
          </div>
          <button className="primary-action" disabled={submitDisabled} type="submit">
            <Send size={18} /> {busy ? "Asking" : "Ask"}
          </button>
        </form>

        {message ? <p className="error-line">{message}</p> : null}
        {answer ? <AnswerPanel answer={answer} /> : null}
      </section>
    </main>
  );
}

function AnswerPanel({ answer }: { answer: ChatQuestionResponse }) {
  return (
    <section className="answer-panel">
      <header className="answer-header">
        <h2>Answer</h2>
        <span className="answer-chip">{answer.sourceHandleIds.length} sources</span>
      </header>
      <FormattedAnswer text={answer.answer} />

      <details className="answer-disclosure">
        <summary>
          <span>
            <FileText size={16} /> Sources
          </span>
          <small>{answer.citations.length}</small>
          <ChevronDown className="disclosure-icon" size={16} />
        </summary>
        <div className="citation-list">
          {answer.citations.map((citation) => (
            <article className="citation-card" key={`${citation.handleId}-${citation.excerpt}`}>
              <div className="citation-meta">
                <strong>{citation.documentType ?? "Document"}</strong>
                <span>{citation.policyNumber}</span>
              </div>
              <a className="citation-link" href={documentViewUrl(citation.handleId)} target="_blank" rel="noreferrer">
                <code>{citation.handleId}</code>
                <ExternalLink size={14} aria-hidden="true" />
              </a>
              <p>{citation.excerpt}</p>
            </article>
          ))}
        </div>
      </details>

      <details className="answer-disclosure">
        <summary>
          <span>
            <Route size={16} /> Run details
          </span>
          <small>{answer.additionalDmsFetchOccurred ? "DMS fetched" : "Vector only"}</small>
          <ChevronDown className="disclosure-icon" size={16} />
        </summary>
        <div className="metric-grid">
          <Metric label="OCR selected" value={answer.selectedOcrModelName} />
          <Metric label="OCR used" value={answer.ocrModelUsedName} />
          <Metric label="Agent selected" value={answer.selectedAgentModelName} />
          <Metric label="Agent used" value={answer.agentModelUsedName} />
          <Metric label="DMS fetch" value={answer.additionalDmsFetchOccurred ? "Yes" : "No"} />
        </div>
        <div className="route-line">{answer.routeTaken.join(" -> ")}</div>
      </details>
    </section>
  );
}

function FormattedAnswer({ text }: { text: string }) {
  const formatted = formatAnswerText(text);
  return (
    <div className="answer-body">
      {formatted.intro.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {formatted.timeline.length > 0 ? (
        <section className="answer-timeline">
          <h3>Timeline and History</h3>
          <ul>
            {formatted.timeline.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatAnswerText(value: string): { intro: string[]; timeline: string[] } {
  const clean = stripMarkdownEmphasis(value).replace(/\s+/g, " ").trim();
  const [rawIntroText, rawTimelineText] = clean.split(/\s*Timeline and History:\s*/i);
  const introText = rawIntroText ?? "";
  const timelineText = rawTimelineText ?? "";
  const introSentences = splitSentences(introText);
  return {
    intro: introSentences.length > 1 ? introSentences : [introText].filter(Boolean),
    timeline: splitTimelineItems(timelineText)
  };
}

function splitSentences(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitTimelineItems(value: string): string[] {
  if (!value.trim()) return [];
  const normalized = value
    .replace(/\s+(?=Payment for\b)/g, "\n")
    .replace(/\s+(?=[A-Z][a-z]+ \d{1,2}, \d{4}\s+(?:to|through)\b)/g, "\n")
    .replace(/\s+(?=[A-Z][a-z]+ \d{1,2}, \d{4}:)/g, "\n");

  const items = normalized
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 1 ? items : splitSentences(value);
}

function stripMarkdownEmphasis(value: string): string {
  return value
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1");
}

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
