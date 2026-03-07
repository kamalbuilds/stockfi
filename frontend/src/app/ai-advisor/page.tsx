"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const STOCK_COLORS: Record<string, string> = {
  TSLA: "#E31937",
  AMZN: "#FF9900",
  PLTR: "#8B5CF6",
  NFLX: "#E50914",
  AMD: "#ED1C24",
};

const STOCK_NAMES: Record<string, string> = {
  TSLA: "Tesla",
  AMZN: "Amazon",
  PLTR: "Palantir",
  NFLX: "Netflix",
  AMD: "AMD",
};

interface StockSuggestion {
  ticker: string;
  weight: number;
  reason: string;
}

interface BasketSuggestion {
  name: string;
  stocks: StockSuggestion[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  suggestion?: BasketSuggestion | null;
}

const EXAMPLE_PROMPTS = [
  "I want a tech-heavy growth portfolio",
  "Build me a balanced basket for long-term holding",
  "I'm bullish on AI, what should I buy?",
  "Create a high-risk, high-reward basket",
  "What's the safest combination of these stocks?",
];

function CompositionBar({ stocks }: { stocks: StockSuggestion[] }) {
  return (
    <div className="space-y-3">
      {/* Horizontal stacked bar */}
      <div className="flex h-8 w-full overflow-hidden rounded-lg">
        {stocks.map((s) => (
          <div
            key={s.ticker}
            style={{
              width: `${s.weight}%`,
              backgroundColor: STOCK_COLORS[s.ticker] || "#666",
            }}
            className="flex items-center justify-center text-[10px] font-bold text-white transition-all duration-500"
          >
            {s.weight >= 10 ? `${s.ticker} ${s.weight}%` : s.weight >= 5 ? `${s.weight}%` : ""}
          </div>
        ))}
      </div>

      {/* Individual stock bars */}
      <div className="space-y-2">
        {stocks.map((s) => (
          <div key={s.ticker} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: STOCK_COLORS[s.ticker] || "#666" }}
                />
                <span className="font-semibold text-white">
                  {s.ticker}
                </span>
                <span className="text-zinc-500">
                  {STOCK_NAMES[s.ticker] || s.ticker}
                </span>
              </div>
              <span className="font-mono text-emerald-400 font-semibold">
                {s.weight}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/5">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${s.weight}%`,
                  backgroundColor: STOCK_COLORS[s.ticker] || "#666",
                }}
              />
            </div>
            <p className="text-[11px] text-zinc-500 pl-5">{s.reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildBasketQueryParams(suggestion: BasketSuggestion): string {
  const params = new URLSearchParams();
  params.set("name", suggestion.name);
  // Build a symbol from the name (first letters, uppercase)
  const symbol = suggestion.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 6);
  params.set("symbol", symbol);
  for (const s of suggestion.stocks) {
    params.set(`w_${s.ticker}`, s.weight.toString());
  }
  return params.toString();
}

export default function AIAdvisorPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(prompt?: string) {
    const text = prompt || input.trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${res.status})`);
      }

      const data = await res.json();

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.message || "Here is my suggestion.",
        suggestion: data.suggestion || null,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : "Something went wrong";
      setError(errMsg);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${errMsg}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="min-h-screen py-12">
      <div className="mx-auto max-w-4xl px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 mb-4">
            <span className="text-emerald-400 text-xs font-semibold uppercase tracking-wide">
              AI-Powered
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            AI Stock Advisor
          </h1>
          <p className="text-zinc-400 max-w-2xl">
            Tell the AI what kind of portfolio you want and it will suggest a
            basket composition from the 5 stocks available on Robinhood Chain.
            Create the basket on-chain with one click.
          </p>
        </div>

        {/* Chat Area */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
          {/* Messages */}
          <div className="min-h-[400px] max-h-[600px] overflow-y-auto p-6 space-y-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 space-y-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                  <svg
                    className="h-8 w-8 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                    />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm text-zinc-400 mb-1">
                    Ask me anything about building a stock basket
                  </p>
                  <p className="text-xs text-zinc-600">
                    Available: TSLA, AMZN, PLTR, NFLX, AMD
                  </p>
                </div>

                {/* Example prompts */}
                <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                  {EXAMPLE_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => handleSend(prompt)}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-white/10 hover:border-emerald-500/30 transition-all"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] space-y-3 ${
                    msg.role === "user"
                      ? "rounded-2xl rounded-br-md bg-emerald-500/15 border border-emerald-500/20 px-4 py-3"
                      : "rounded-2xl rounded-bl-md bg-white/[0.04] border border-white/5 px-4 py-3"
                  }`}
                >
                  {/* Role label */}
                  <div className="flex items-center gap-2 mb-1">
                    {msg.role === "assistant" && (
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500/20">
                        <svg
                          className="h-3 w-3 text-emerald-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                          />
                        </svg>
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider ${
                        msg.role === "user"
                          ? "text-emerald-400"
                          : "text-zinc-500"
                      }`}
                    >
                      {msg.role === "user" ? "You" : "StockFi AI"}
                    </span>
                  </div>

                  {/* Message text */}
                  <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </p>

                  {/* Basket suggestion card */}
                  {msg.suggestion && (
                    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-white">
                            {msg.suggestion.name}
                          </h3>
                          <p className="text-[11px] text-zinc-500">
                            Suggested basket composition
                          </p>
                        </div>
                        <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                          {msg.suggestion.stocks.length} stocks
                        </span>
                      </div>

                      <CompositionBar stocks={msg.suggestion.stocks} />

                      <Link
                        href={`/basket?${buildBasketQueryParams(msg.suggestion)}`}
                      >
                        <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white border-0 mt-2">
                          Create This Basket
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-white/[0.04] border border-white/5 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500/20">
                      <svg
                        className="h-3 w-3 text-emerald-400 animate-pulse"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                        />
                      </svg>
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      StockFi AI
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-400/60 animate-bounce [animation-delay:0ms]" />
                    <div className="h-2 w-2 rounded-full bg-emerald-400/60 animate-bounce [animation-delay:150ms]" />
                    <div className="h-2 w-2 rounded-full bg-emerald-400/60 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Error banner */}
          {error && (
            <div className="mx-6 mb-3 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* Input area */}
          <div className="border-t border-white/5 p-4">
            <div className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe the basket you want (e.g. 'AI-focused growth portfolio')..."
                disabled={loading}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-emerald-500/50 focus:outline-none disabled:opacity-50"
              />
              <Button
                onClick={() => handleSend()}
                disabled={!input.trim() || loading}
                className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 px-6"
              >
                {loading ? (
                  <svg
                    className="h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                ) : (
                  "Send"
                )}
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-zinc-600 text-center">
              AI suggestions are for informational purposes only. Always do your
              own research.
            </p>
          </div>
        </div>

        {/* Supported stocks footer */}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {Object.entries(STOCK_NAMES).map(([ticker, name]) => (
            <div
              key={ticker}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5"
            >
              <span
                className="h-2 w-2 rounded-sm"
                style={{ backgroundColor: STOCK_COLORS[ticker] }}
              />
              <span className="text-xs font-semibold text-white">
                {ticker}
              </span>
              <span className="text-xs text-zinc-500">{name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
