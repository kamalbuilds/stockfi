"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useReadContracts } from "wagmi";
import { ORACLES, SUPPORTED_STOCKS } from "@/config/contracts";
import { PRICE_ORACLE_ABI } from "@/config/abi";
import { Button } from "@/components/ui/button";

const BASKET_CONFIG = {
  name: "KTECH",
  targetWeights: { TSLA: 40, AMZN: 30, PLTR: 20, AMD: 10 },
  description: "Tech Giants basket rebalanced by AI agent",
};

type RebalanceAction = {
  ticker: string;
  direction: "BUY" | "SELL";
  amount: string;
  reason: string;
};

type AgentLog = {
  ts: string;
  type: "analysis" | "decision" | "action" | "complete";
  message: string;
};

export default function RebalancePage() {
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [actions, setActions] = useState<RebalanceAction[]>([]);
  const [driftData, setDriftData] = useState<Record<string, { current: number; target: number }>>({});
  const [step, setStep] = useState(0);

  // Fetch oracle prices
  const oracleTickers = Object.keys(ORACLES);
  const oraclePrices = useReadContracts({
    contracts: Object.entries(ORACLES).map(([, addr]) => ({
      address: addr,
      abi: PRICE_ORACLE_ABI,
      functionName: "latestPrice" as const,
    })),
    query: { enabled: true, refetchInterval: 30_000 },
  });

  const prices: Record<string, number> = {};
  if (oraclePrices.data) {
    oracleTickers.forEach((ticker, i) => {
      const result = oraclePrices.data?.[i];
      if (result?.status === "success" && result.result) {
        prices[ticker] = Number(result.result as bigint) / 1e8;
      }
    });
  }

  // Simulate drifted weights (as if market moved)
  const simulatedWeights = useMemo(() => {
    const targets = BASKET_CONFIG.targetWeights as Record<string, number>;
    const drifted: Record<string, number> = {};
    const tickers = Object.keys(targets);

    // Simulate drift based on price ratios
    let total = 0;
    tickers.forEach((t) => {
      const price = prices[t] || 100;
      const drift = ((price * 7) % 13) - 6; // deterministic pseudo-drift
      drifted[t] = Math.max(5, targets[t] + drift);
      total += drifted[t];
    });

    // Normalize to 100
    tickers.forEach((t) => {
      drifted[t] = Math.round((drifted[t] / total) * 100);
    });

    return drifted;
  }, [prices]);

  const maxDrift = useMemo(() => {
    const targets = BASKET_CONFIG.targetWeights as Record<string, number>;
    let max = 0;
    Object.keys(targets).forEach((t) => {
      const drift = Math.abs((simulatedWeights[t] || 0) - targets[t]);
      if (drift > max) max = drift;
    });
    return max;
  }, [simulatedWeights]);

  function addLog(log: AgentLog) {
    setLogs((prev) => [...prev, log]);
  }

  async function runRebalance() {
    setIsRunning(true);
    setLogs([]);
    setActions([]);
    setStep(0);

    const targets = BASKET_CONFIG.targetWeights as Record<string, number>;
    const tickers = Object.keys(targets);
    const now = () => new Date().toISOString().slice(11, 19);

    // Step 1: Analysis
    setStep(1);
    addLog({ ts: now(), type: "analysis", message: "Connecting to on-chain oracles..." });
    await delay(800);

    addLog({ ts: now(), type: "analysis", message: `Reading ${tickers.length} price feeds from Robinhood Chain oracles` });
    await delay(600);

    tickers.forEach((t) => {
      const price = prices[t];
      if (price) {
        addLog({ ts: now(), type: "analysis", message: `  ${t}: $${price.toFixed(2)}` });
      }
    });
    await delay(500);

    // Step 2: Drift detection
    setStep(2);
    addLog({ ts: now(), type: "analysis", message: "Calculating portfolio drift from target weights..." });
    await delay(700);

    const newDrift: Record<string, { current: number; target: number }> = {};
    tickers.forEach((t) => {
      const current = simulatedWeights[t] || 0;
      const target = targets[t];
      newDrift[t] = { current, target };
      const drift = current - target;
      const emoji = Math.abs(drift) > 3 ? (drift > 0 ? "OVERWEIGHT" : "UNDERWEIGHT") : "OK";
      addLog({
        ts: now(),
        type: "analysis",
        message: `  ${t}: ${current}% (target ${target}%) => ${emoji} ${drift > 0 ? "+" : ""}${drift}%`,
      });
    });
    setDriftData(newDrift);
    await delay(600);

    addLog({ ts: now(), type: "analysis", message: `Max drift: ${maxDrift}% | Threshold: 3%` });
    await delay(400);

    // Step 3: Decision
    setStep(3);
    if (maxDrift <= 3) {
      addLog({ ts: now(), type: "decision", message: "Drift within tolerance. No rebalance needed." });
      addLog({ ts: now(), type: "complete", message: "Agent sleeping until next check interval (1h)." });
      setIsRunning(false);
      return;
    }

    addLog({ ts: now(), type: "decision", message: `Drift exceeds 3% threshold. Planning rebalance trades...` });
    await delay(800);

    // Step 4: Generate actions
    setStep(4);
    const newActions: RebalanceAction[] = [];
    tickers.forEach((t) => {
      const current = simulatedWeights[t] || 0;
      const target = targets[t];
      const diff = current - target;
      if (Math.abs(diff) > 2) {
        const action: RebalanceAction = {
          ticker: t,
          direction: diff > 0 ? "SELL" : "BUY",
          amount: `${Math.abs(diff)}% of position`,
          reason: diff > 0
            ? `${t} overweight by ${diff}%. Trim to restore target.`
            : `${t} underweight by ${Math.abs(diff)}%. Add to restore target.`,
        };
        newActions.push(action);
        addLog({
          ts: now(),
          type: "action",
          message: `${action.direction} ${t}: ${action.amount} - ${action.reason}`,
        });
      }
    });
    setActions(newActions);
    await delay(600);

    // Step 5: Complete
    setStep(5);
    addLog({ ts: now(), type: "complete", message: `Rebalance plan ready. ${newActions.length} trades proposed.` });
    addLog({ ts: now(), type: "complete", message: "In production: agent would execute trades via DEX or OTC." });
    addLog({ ts: now(), type: "complete", message: "Next check scheduled in 1 hour." });

    setIsRunning(false);
  }

  // Initialize drift data on load
  useEffect(() => {
    const targets = BASKET_CONFIG.targetWeights as Record<string, number>;
    const newDrift: Record<string, { current: number; target: number }> = {};
    Object.keys(targets).forEach((t) => {
      newDrift[t] = { current: simulatedWeights[t] || 0, target: targets[t] };
    });
    setDriftData(newDrift);
  }, [simulatedWeights]);

  return (
    <div className="min-h-screen py-12">
      <div className="mx-auto max-w-5xl px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-1.5 text-sm text-cyan-400">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
            AI Agent Concept
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">AI Basket Rebalancer</h1>
          <p className="text-zinc-400 max-w-2xl">
            An autonomous AI agent monitors your basket&apos;s weight drift and proposes rebalancing trades
            to maintain target allocations. Think of it as a robo-advisor for your on-chain index fund.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Left: Agent Console */}
          <div className="md:col-span-2 space-y-6">
            {/* Basket Info */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-white">{BASKET_CONFIG.name}</h2>
                  <p className="text-xs text-zinc-500">{BASKET_CONFIG.description}</p>
                </div>
                <Button
                  onClick={runRebalance}
                  disabled={isRunning}
                  className="bg-cyan-500 hover:bg-cyan-600 text-white border-0"
                >
                  {isRunning ? (
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                      Agent Running...
                    </span>
                  ) : (
                    "Run Rebalance Check"
                  )}
                </Button>
              </div>

              {/* Weight comparison bars */}
              <div className="space-y-3">
                {Object.entries(BASKET_CONFIG.targetWeights).map(([ticker, target]) => {
                  const current = driftData[ticker]?.current ?? target;
                  const drift = current - target;
                  const meta = getStockMeta(ticker);
                  return (
                    <div key={ticker} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          {meta?.logo && (
                            <img src={meta.logo} alt={meta.name} className="w-4 h-4 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          )}
                          <span className="text-zinc-300 font-medium">{ticker}</span>
                          {prices[ticker] && (
                            <span className="text-zinc-600 font-mono">${prices[ticker].toFixed(2)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-zinc-500">Target: {target}%</span>
                          <span className={`font-semibold ${Math.abs(drift) > 3 ? (drift > 0 ? "text-yellow-400" : "text-red-400") : "text-emerald-400"}`}>
                            Current: {current}%
                          </span>
                          {Math.abs(drift) > 0 && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${drift > 3 ? "bg-yellow-500/10 text-yellow-400" : drift < -3 ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                              {drift > 0 ? "+" : ""}{drift}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="relative h-2 rounded-full bg-white/5">
                        <div
                          className="absolute h-full rounded-full bg-zinc-600 opacity-40"
                          style={{ width: `${target}%` }}
                        />
                        <div
                          className={`absolute h-full rounded-full transition-all duration-500 ${Math.abs(drift) > 3 ? "bg-yellow-500" : "bg-emerald-500"}`}
                          style={{ width: `${current}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Agent Console Log */}
            <div className="rounded-2xl border border-white/5 bg-black/40 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-white/[0.02]">
                <div className={`h-2 w-2 rounded-full ${isRunning ? "bg-cyan-400 animate-pulse" : logs.length > 0 ? "bg-emerald-400" : "bg-zinc-600"}`} />
                <span className="text-xs font-mono text-zinc-400">agent-console</span>
                <span className="text-[10px] text-zinc-600 ml-auto">
                  {step > 0 && `Step ${step}/5`}
                </span>
              </div>
              <div className="p-4 font-mono text-xs max-h-80 overflow-y-auto space-y-1">
                {logs.length === 0 ? (
                  <div className="text-zinc-600">
                    Click &quot;Run Rebalance Check&quot; to start the AI agent...
                  </div>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className={`${
                      log.type === "analysis" ? "text-zinc-400" :
                      log.type === "decision" ? "text-cyan-400" :
                      log.type === "action" ? "text-yellow-400" :
                      "text-emerald-400"
                    }`}>
                      <span className="text-zinc-600">[{log.ts}]</span> {log.message}
                    </div>
                  ))
                )}
                {isRunning && (
                  <div className="text-cyan-400 animate-pulse">
                    <span className="text-zinc-600">[...]</span> Processing...
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Sidebar */}
          <div className="space-y-4">
            {/* Proposed Actions */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Proposed Trades</h3>
              {actions.length === 0 ? (
                <div className="text-xs text-zinc-600 py-4 text-center">
                  Run the agent to see trade proposals
                </div>
              ) : (
                <div className="space-y-2">
                  {actions.map((a, i) => (
                    <div key={i} className={`rounded-lg p-3 border text-xs ${
                      a.direction === "BUY"
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : "border-yellow-500/20 bg-yellow-500/5"
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-white">{a.ticker}</span>
                        <span className={`font-semibold px-2 py-0.5 rounded ${
                          a.direction === "BUY" ? "bg-emerald-500/20 text-emerald-400" : "bg-yellow-500/20 text-yellow-400"
                        }`}>
                          {a.direction}
                        </span>
                      </div>
                      <div className="text-zinc-400">{a.amount}</div>
                      <div className="text-zinc-600 mt-1">{a.reason}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* How AI Rebalancing Works */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
              <h3 className="text-sm font-semibold text-white mb-3">How It Works</h3>
              <div className="space-y-3 text-[11px] text-zinc-400">
                <div className="flex gap-2">
                  <span className="text-cyan-400 font-bold shrink-0">1</span>
                  <span>AI agent reads on-chain oracle prices every hour</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-cyan-400 font-bold shrink-0">2</span>
                  <span>Calculates weight drift from target allocation</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-cyan-400 font-bold shrink-0">3</span>
                  <span>If drift exceeds threshold (3%), proposes trades</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-cyan-400 font-bold shrink-0">4</span>
                  <span>Executes rebalance via on-chain swaps (DEX or OTC)</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-cyan-400 font-bold shrink-0">5</span>
                  <span>Reports actions and sleeps until next check</span>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-white/5 text-[10px] text-zinc-600">
                Future: integrate with OpenClaw or similar AI agent frameworks to
                enable fully autonomous portfolio management.
              </div>
            </div>

            {/* Links */}
            <div className="flex flex-col gap-2">
              <Link href="/baskets">
                <Button variant="outline" className="w-full border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 text-xs">
                  View Baskets
                </Button>
              </Link>
              <Link href="/ai-advisor">
                <Button variant="outline" className="w-full border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 text-xs">
                  AI Stock Advisor
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getStockMeta(ticker: string) {
  return SUPPORTED_STOCKS.find((s) => s.ticker === ticker);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
