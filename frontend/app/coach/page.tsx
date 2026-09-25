"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, coachAnalyze, coachChat, getSimulatedWalletClean, getSimulatedWalletBad } from "@/lib/api";
import type { AuditResult, PrivacyFlag } from "@/lib/types";
import { useToast } from "@/components/ui/toast";

type AnalyzeState = { status: "idle" } | { status: "loading" } | { status: "success"; data: { analysis: string; provider: string; timestamp: string } } | { status: "error"; message: string };
type ChatMessage = { role: "user" | "assistant"; content: string; provider?: string; timestamp?: string };

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      {description && <p className="mt-1 text-xs text-zinc-500">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function sanitizeFlagsForAI(flags: PrivacyFlag[]): PrivacyFlag[] {
  // Send minimal required fields per backend schema: type, severity, penalty, title, details, chainAnalysisRisk
  // Omit raw evidence txids where possible to keep payload minimal; backend fallback uses these fields
  return flags.map((f) => ({
    type: f.type,
    severity: f.severity,
    penalty: f.penalty,
    title: f.title,
    details: f.details,
    chainAnalysisRisk: f.chainAnalysisRisk,
  })) as PrivacyFlag[];
}

export default function CoachPage() {
  const { showToast } = useToast();
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [auditSource, setAuditSource] = useState<"session" | "demo-clean" | "demo-bad" | null>(null);
  const [analyzeState, setAnalyzeState] = useState<AnalyzeState>({ status: "idle" });
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  // Load last sanitized audit from Privacy page
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("sl:lastAudit");
      if (raw) {
        const parsed = JSON.parse(raw) as AuditResult;
        if (parsed && typeof parsed.score === "number") {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setAudit(parsed);
          setAuditSource("session");
        }
      }
    } catch {}
  }, []);

  async function handleExplainScore() {
    if (!audit) {
      showToast("Run a privacy analysis first.", "error");
      return;
    }
    setAnalyzeState({ status: "loading" });
    try {
      const res = await coachAnalyze({
        score: audit.score,
        grade: audit.grade,
        flags: sanitizeFlagsForAI(audit.flags),
        summary: audit.summary as unknown as Record<string, unknown>,
      });
      setAnalyzeState({ status: "success", data: { analysis: res.data.analysis, provider: res.data.provider, timestamp: res.data.timestamp } });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "AI request failed";
      setAnalyzeState({ status: "error", message: msg });
      showToast(msg, "error");
    }
  }

  async function handleExplainFlag(flag: PrivacyFlag) {
    if (!audit) return;
    setAnalyzeState({ status: "loading" });
    try {
      const res = await coachAnalyze({
        score: audit.score,
        grade: audit.grade,
        flags: sanitizeFlagsForAI(audit.flags),
        summary: audit.summary as unknown as Record<string, unknown>,
        userMessage: `Explain the ${flag.type} finding: ${flag.title} — ${flag.details} Why is it a problem and how can I improve?`,
      });
      setAnalyzeState({ status: "success", data: { analysis: res.data.analysis, provider: res.data.provider, timestamp: res.data.timestamp } });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "AI request failed";
      setAnalyzeState({ status: "error", message: msg });
    }
  }

  async function handleLoadDemo(type: "clean" | "bad") {
    setDemoLoading(true);
    try {
      const res = type === "clean" ? await getSimulatedWalletClean() : await getSimulatedWalletBad();
      setAudit(res.audit);
      setAuditSource(type === "clean" ? "demo-clean" : "demo-bad");
      try {
        sessionStorage.setItem("sl:lastAudit", JSON.stringify(res.audit));
      } catch {}
      showToast(`Demo ${type} audit loaded (${res.audit.score}/100). This is not your wallet.`, "info");
      setAnalyzeState({ status: "idle" });
      setChatHistory([]);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Demo load failed";
      showToast(msg, "error");
    } finally {
      setDemoLoading(false);
    }
  }

  function handleClearAudit() {
    setAudit(null);
    setAuditSource(null);
    setAnalyzeState({ status: "idle" });
    setChatHistory([]);
    try {
      sessionStorage.removeItem("sl:lastAudit");
    } catch {}
  }

  async function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault();
    const message = chatInput.trim();
    if (!message) return;
    if (!audit) {
      showToast("Run a privacy analysis first, then ask the AI Coach.", "error");
      return;
    }
    const userMsg: ChatMessage = { role: "user", content: message };
    setChatHistory((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);
    try {
      // Build conversationHistory for backend: prior messages in {role, content} shape
      const historyForBackend = [...chatHistory, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const res = await coachChat({
        message,
        score: audit.score,
        grade: audit.grade,
        flags: sanitizeFlagsForAI(audit.flags),
        conversationHistory: historyForBackend.slice(0, -1), // all before current user message
      });
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: res.data.reply,
        provider: res.data.provider,
        timestamp: res.data.timestamp,
      };
      setChatHistory((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Chat failed";
      setChatHistory((prev) => [...prev, { role: "assistant", content: `Error: ${msg}` }]);
      showToast(msg, "error");
    } finally {
      setChatLoading(false);
    }
  }

  function handleExampleQuestion(q: string) {
    setChatInput(q);
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="coach-heading" className="rounded-lg border border-zinc-200 bg-white p-6">
        <h1 id="coach-heading" className="text-xl font-semibold text-zinc-900">
          AI Privacy Coach
        </h1>
        <p className="mt-2 max-w-prose text-sm text-zinc-600">
          Get plain-English explanations of your local privacy audit. The coach receives only your sanitized audit
          summary (score, grade, finding codes) — not raw UTXOs, private keys, or full transaction history. AI
          credentials stay on the backend.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Analysis is grounded in your actual audit. If no finding exists (e.g., no dust), the coach will not invent one.
        </p>
      </section>

      {/* Audit context */}
      <Section
        title="Audit Context"
        description="Grounded in real local audit. Only score, grade, flags, and summary are sent to the AI backend."
      >
        {!audit ? (
          <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm text-zinc-700">No audit loaded.</p>
            <p className="mt-1 text-sm text-zinc-600">Run a privacy analysis first, then ask the AI Coach to explain the findings.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/privacy" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
                Go to Privacy Analysis
              </Link>
              <button
                type="button"
                onClick={() => handleLoadDemo("clean")}
                disabled={demoLoading}
                className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Load demo: Pristine
              </button>
              <button
                type="button"
                onClick={() => handleLoadDemo("bad")}
                disabled={demoLoading}
                className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Load demo: Leaky
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-500">Demo audits are from GET /api/scenarios/... — not your wallet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm font-medium text-zinc-800">
                  Score {audit.score}/100 — {audit.grade}
                </span>
                <span className="text-xs text-zinc-500">
                  Source: {auditSource === "session" ? "Last privacy analysis (session)" : auditSource === "demo-clean" ? "Demo: Pristine" : "Demo: Leaky"} •{" "}
                  {new Date(audit.analyzedAt).toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={handleClearAudit}
                  className="ml-auto rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Clear
                </button>
              </div>
              <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500">UTXOs</dt>
                  <dd className="text-zinc-700">{audit.summary.totalUtxos}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Flags</dt>
                  <dd className="text-zinc-700">{audit.flags.length ? audit.flags.map((f) => f.type).join(", ") : "None"}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-zinc-500">
                Payload to AI: <code className="rounded bg-white px-1">score, grade, flags[type/severity/penalty/title/details], summary</code> — no
                raw UTXOs, no private data.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExplainScore}
                disabled={analyzeState.status === "loading"}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {analyzeState.status === "loading" ? "Asking coach..." : "Explain my privacy score"}
              </button>
              <button
                type="button"
                onClick={() => handleLoadDemo(auditSource?.startsWith("demo") ? "bad" : "clean")}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Switch demo
              </button>
            </div>

            {audit.flags.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-700">Explain individual finding:</p>
                <div className="flex flex-wrap gap-2">
                  {audit.flags.map((flag) => (
                    <button
                      key={flag.type}
                      type="button"
                      onClick={() => handleExplainFlag(flag)}
                      disabled={analyzeState.status === "loading"}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Why is {flag.type} a problem?
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!audit) return;
                  setAnalyzeState({ status: "loading" });
                  coachAnalyze({
                    score: audit.score,
                    grade: audit.grade,
                    flags: sanitizeFlagsForAI(audit.flags),
                    summary: audit.summary as unknown as Record<string, unknown>,
                    userMessage: "How can I improve my privacy? Give me concrete steps.",
                  })
                    .then((res) => setAnalyzeState({ status: "success", data: { analysis: res.data.analysis, provider: res.data.provider, timestamp: res.data.timestamp } }))
                    .catch((e) => {
                      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "AI request failed";
                      setAnalyzeState({ status: "error", message: msg });
                    });
                }}
                disabled={analyzeState.status === "loading"}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                How can I improve?
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* Analyze result */}
      {audit && (
        <Section
          title="Coach Analysis"
          description="Facts from local audit are shown separately from AI explanations. AI does not override the audit."
        >
          {analyzeState.status === "idle" && <p className="text-sm text-zinc-500">No analysis yet. Use the buttons above.</p>}
          {analyzeState.status === "loading" && <p className="text-sm text-zinc-500">Asking the coach...</p>}
          {analyzeState.status === "error" && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-medium text-red-800">AI unavailable</p>
              <p className="mt-1 text-sm text-red-700">{analyzeState.message}</p>
              <p className="mt-1 text-xs text-zinc-600">
                This may be a backend or provider issue. Your local audit remains valid: score {audit.score}/100 —{" "}
                {audit.grade}.
              </p>
            </div>
          )}
          {analyzeState.status === "success" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span>Provider: {analyzeState.data.provider}</span>
                <span>•</span>
                <span>{new Date(analyzeState.data.timestamp).toLocaleString()}</span>
              </div>
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                <p className="mb-2 text-xs font-medium text-zinc-700">Local audit facts (ground truth):</p>
                <p className="text-xs text-zinc-600">
                  Score {audit.score}/100 — {audit.grade} • Flags:{" "}
                  {audit.flags.length ? audit.flags.map((f) => `${f.type}(${f.severity})`).join(", ") : "None"} • UTXOs{" "}
                  {audit.summary.totalUtxos}
                </p>
              </div>
              <pre className="whitespace-pre-wrap break-words rounded-md border border-zinc-200 bg-white p-4 text-sm leading-relaxed text-zinc-800">
                {analyzeState.data.analysis}
              </pre>
              <p className="text-xs text-zinc-500">Above is AI-generated explanation grounded in the local audit. Recommendations are suggestions, not guarantees.</p>
            </div>
          )}
        </Section>
      )}

      {/* Chat */}
      <Section title="Ask the Coach" description="Chat grounded in your audit. Example questions provided. Empty audit shows guidance, not fabricated wallet data.">
        {!audit ? (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm text-zinc-600">Run a privacy analysis first, then ask the AI Coach to explain the findings.</p>
            <p className="mt-1 text-xs text-zinc-500">Chat without audit context would invent wallet information — blocked by design.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1">
              {[
                "Why is address reuse bad?",
                "How can multiple Bitcoin transactions become linked?",
                "What does common-input ownership mean?",
                "Why does receiving to a fresh address help privacy?",
                "Explain dust attacks",
                "How does NIP-17 help?",
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleExampleQuestion(q)}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  {q}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <div className="max-h-64 space-y-2 overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-3">
                {chatHistory.length === 0 ? (
                  <p className="text-sm text-zinc-500">No messages yet. Ask a question above.</p>
                ) : (
                  chatHistory.map((m, idx) => (
                    <div
                      key={idx}
                      className={`rounded-md p-3 text-sm ${m.role === "user" ? "bg-white border border-zinc-200" : "bg-zinc-900 text-white"}`}
                    >
                      <p className="text-xs font-medium opacity-70">{m.role === "user" ? "You" : "Coach" + (m.provider ? ` • ${m.provider}` : "")}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words">{m.content}</p>
                      {m.timestamp && <p className="mt-1 text-xs opacity-60">{new Date(m.timestamp).toLocaleString()}</p>}
                    </div>
                  ))
                )}
                {chatLoading && <p className="text-sm text-zinc-500">Coach is thinking...</p>}
              </div>

              <form onSubmit={handleChatSubmit} className="flex gap-2">
                <label htmlFor="coach-input" className="sr-only">
                  Ask the coach
                </label>
                <input
                  id="coach-input"
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask about dust, reuse, CIOH..."
                  className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  Send
                </button>
              </form>
              <p className="text-xs text-zinc-500">
                Chat payload: <code className="rounded bg-zinc-100 px-1">message</code> + <code className="rounded bg-zinc-100 px-1">score/grade/flags/summary</code> (sanitized). No raw UTXOs.
              </p>
            </div>
          </>
        )}
      </Section>

      <p className="text-xs text-zinc-500">
        AI provider credentials are backend-only. Frontend never uses <code className="rounded bg-zinc-100 px-1">NEXT_PUBLIC_GEMINI_API_KEY</code> etc.
      </p>
    </div>
  );
}
