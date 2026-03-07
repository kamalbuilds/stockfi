"use client";

import { useState, useMemo } from "react";
import { useAccount, useReadContracts, useWriteContract } from "wagmi";
import { parseUnits } from "viem";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  VAULT_ADDRESS,
  ORACLES,
  STOCK_TOKENS,
  USDC_ADDRESS,
  SUPPORTED_STOCKS,
} from "@/config/contracts";
import { STOP_LOSS_VAULT_ABI, PRICE_ORACLE_ABI, ERC20_ABI } from "@/config/abi";

const PREMADE_BASKETS = [
  {
    name: "KTECH",
    subtitle: "Tech Giants",
    stocks: [
      { ticker: "TSLA", weight: 40 },
      { ticker: "AMZN", weight: 30 },
      { ticker: "PLTR", weight: 20 },
      { ticker: "AMD", weight: 10 },
    ],
    accent: "emerald",
  },
  {
    name: "STREAMING",
    subtitle: "Entertainment",
    stocks: [
      { ticker: "NFLX", weight: 50 },
      { ticker: "AMZN", weight: 30 },
      { ticker: "PLTR", weight: 20 },
    ],
    accent: "violet",
  },
  {
    name: "CHIPS & AI",
    subtitle: "Semiconductor + AI",
    stocks: [
      { ticker: "AMD", weight: 40 },
      { ticker: "PLTR", weight: 35 },
      { ticker: "TSLA", weight: 25 },
    ],
    accent: "cyan",
  },
];

function getStockMeta(ticker: string) {
  return SUPPORTED_STOCKS.find((s) => s.ticker === ticker);
}

export default function ProtectBasketPage() {
  const { address } = useAccount();
  const [selectedBasket, setSelectedBasket] = useState(0);
  const [stopPercent, setStopPercent] = useState(10);
  const [amount, setAmount] = useState("1");
  const [txStep, setTxStep] = useState<"idle" | "approving" | "creating" | "done">("idle");
  const [txResults, setTxResults] = useState<string[]>([]);

  const basket = PREMADE_BASKETS[selectedBasket];
  const { writeContractAsync } = useWriteContract();

  // Fetch all oracle prices
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

  // Calculate basket weighted price and individual stop prices
  const basketAnalysis = useMemo(() => {
    const amountNum = parseFloat(amount) || 0;
    const items = basket.stocks.map((s) => {
      const currentPrice = prices[s.ticker] || 0;
      const stopPrice = currentPrice * (1 - stopPercent / 100);
      const positionValue = currentPrice * amountNum * (s.weight / 100);
      const premium = positionValue * 0.02;
      return {
        ...s,
        currentPrice,
        stopPrice,
        positionValue,
        premium,
      };
    });

    const totalValue = items.reduce((sum, i) => sum + i.positionValue, 0);
    const totalPremium = items.reduce((sum, i) => sum + i.premium, 0);
    const weightedPrice = items.reduce(
      (sum, i) => sum + i.currentPrice * (i.weight / 100),
      0
    );

    return { items, totalValue, totalPremium, weightedPrice };
  }, [basket.stocks, prices, stopPercent, amount]);

  async function handleProtect() {
    if (!address) return;
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) return;

    setTxStep("approving");
    setTxResults([]);
    const results: string[] = [];

    try {
      // Create individual stop-losses for each stock in the basket
      for (const stock of basketAnalysis.items) {
        if (stock.currentPrice === 0) continue;

        const stockTokenAddr = STOCK_TOKENS[stock.ticker];
        const oracleAddr = ORACLES[stock.ticker];
        if (!stockTokenAddr || !oracleAddr) continue;

        const stockAmount = parseUnits(
          (amountNum * (stock.weight / 100)).toFixed(18),
          18
        );
        const stopPriceRaw = BigInt(Math.round(stock.stopPrice * 1e8));

        // Approve stock token
        results.push(`Approving ${stock.ticker}...`);
        setTxResults([...results]);
        await writeContractAsync({
          address: stockTokenAddr,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [VAULT_ADDRESS, stockAmount],
        });

        // Approve USDC for premium
        const usdcAmount = parseUnits("1000", 6);
        await writeContractAsync({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [VAULT_ADDRESS, usdcAmount],
        });

        // Create stop-loss
        setTxStep("creating");
        results.push(`Creating ${stock.ticker} stop-loss at $${stock.stopPrice.toFixed(2)}...`);
        setTxResults([...results]);

        const hash = await writeContractAsync({
          address: VAULT_ADDRESS,
          abi: STOP_LOSS_VAULT_ABI,
          functionName: "createStopLoss",
          args: [stockTokenAddr, stock.ticker, stockAmount, stopPriceRaw, oracleAddr],
        });

        results.push(`${stock.ticker} protected! Tx: ${hash.slice(0, 10)}...`);
        setTxResults([...results]);
      }

      setTxStep("done");
      results.push("All positions protected!");
      setTxResults([...results]);
    } catch (err) {
      console.error(err);
      results.push("Transaction failed. Check console.");
      setTxResults([...results]);
      setTxStep("idle");
    }
  }

  const accentMap: Record<string, string> = {
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    violet: "border-violet-500/30 bg-violet-500/10 text-violet-400",
    cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
  };

  return (
    <div className="min-h-screen py-12">
      <div className="mx-auto max-w-4xl px-4">
        {/* Header */}
        <div className="mb-8">
          <Link href="/baskets" className="text-sm text-zinc-500 hover:text-zinc-300 mb-3 inline-block">
            &larr; Back to Baskets
          </Link>
          <h1 className="text-3xl font-bold text-white mb-2">Protect Your Basket</h1>
          <p className="text-zinc-400">
            Set a single stop-loss percentage and protect all stocks in your basket simultaneously.
            Each stock gets its own insured stop-loss position.
          </p>
        </div>

        <div className="grid md:grid-cols-5 gap-6">
          {/* Left: Configuration */}
          <div className="md:col-span-3 space-y-6">
            {/* Basket Selector */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
              <label className="block text-sm font-medium text-zinc-300 mb-3">Select Basket</label>
              <div className="flex gap-3">
                {PREMADE_BASKETS.map((b, i) => (
                  <button
                    key={b.name}
                    onClick={() => setSelectedBasket(i)}
                    className={`flex-1 rounded-xl p-4 border transition-all ${
                      selectedBasket === i
                        ? accentMap[b.accent]
                        : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20"
                    }`}
                  >
                    <div className="font-bold text-sm">{b.name}</div>
                    <div className="text-[10px] opacity-70 mt-0.5">{b.subtitle}</div>
                  </button>
                ))}
              </div>

              {/* Basket composition */}
              <div className="mt-4 flex flex-wrap gap-2">
                {basket.stocks.map((s) => {
                  const meta = getStockMeta(s.ticker);
                  return (
                    <div key={s.ticker} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5">
                      {meta?.logo && (
                        <img src={meta.logo} alt={meta.name} className="w-4 h-4 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      )}
                      <span className="text-xs font-semibold text-white">{s.ticker}</span>
                      <span className="text-[10px] text-zinc-500">{s.weight}%</span>
                      {prices[s.ticker] && (
                        <span className="text-[10px] font-mono text-emerald-400">${prices[s.ticker].toFixed(2)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stop-Loss Config */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Basket Units
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 1"
                  min="0.01"
                  step="0.1"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-zinc-600 focus:border-emerald-500/50 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-zinc-300">
                    Stop-Loss Distance
                  </label>
                  <span className="text-lg font-bold text-emerald-400">{stopPercent}% below</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={30}
                  value={stopPercent}
                  onChange={(e) => setStopPercent(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
                <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
                  <span>2% (tight)</span>
                  <span>15% (moderate)</span>
                  <span>30% (wide)</span>
                </div>
              </div>

              {/* Per-stock breakdown */}
              <div className="rounded-xl bg-white/[0.03] p-4 space-y-2">
                <div className="text-xs text-zinc-500 mb-2">Stop-loss prices per stock:</div>
                {basketAnalysis.items.map((item) => (
                  <div key={item.ticker} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-300 font-medium">{item.ticker}</span>
                      <span className="text-[10px] text-zinc-600">{item.weight}%</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-zinc-500">
                        ${item.currentPrice.toFixed(2)}
                      </span>
                      <span className="text-zinc-600">&rarr;</span>
                      <span className="text-red-400 font-mono font-semibold">
                        ${item.stopPrice.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Summary */}
          <div className="md:col-span-2 space-y-4">
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 sticky top-24">
              <h3 className="text-sm font-semibold text-white mb-4">Protection Summary</h3>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Basket</span>
                  <span className="text-white font-semibold">{basket.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Weighted Price</span>
                  <span className="text-emerald-400 font-mono">
                    ${basketAnalysis.weightedPrice.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Stop Distance</span>
                  <span className="text-yellow-400">{stopPercent}% below</span>
                </div>
                <div className="border-t border-white/5 pt-3 flex justify-between text-sm">
                  <span className="text-zinc-500">Total Value</span>
                  <span className="text-white font-semibold">
                    ${basketAnalysis.totalValue.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Premium (2%)</span>
                  <span className="text-emerald-400">
                    ${basketAnalysis.totalPremium.toFixed(2)} USDC
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Positions Created</span>
                  <span className="text-white">{basket.stocks.length} stop-losses</span>
                </div>
              </div>

              {/* How it works */}
              <div className="rounded-xl bg-white/[0.03] p-3 mb-6 text-[11px] text-zinc-500 space-y-1.5">
                <div className="flex gap-2">
                  <span className="text-emerald-400 font-bold">1</span>
                  <span>One click creates {basket.stocks.length} individual stop-losses</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-emerald-400 font-bold">2</span>
                  <span>Each stock protected at {stopPercent}% below current price</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-emerald-400 font-bold">3</span>
                  <span>Insurance pool pre-funds guaranteed execution</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-emerald-400 font-bold">4</span>
                  <span>If any stock gaps, you get USDC at the insured price</span>
                </div>
              </div>

              {/* TX log */}
              {txResults.length > 0 && (
                <div className="rounded-xl bg-white/[0.03] p-3 mb-4 max-h-40 overflow-y-auto">
                  {txResults.map((msg, i) => (
                    <div key={i} className={`text-[11px] py-0.5 ${msg.includes("failed") ? "text-red-400" : msg.includes("protected") || msg.includes("All") ? "text-emerald-400" : "text-zinc-500"}`}>
                      {msg}
                    </div>
                  ))}
                </div>
              )}

              {!address ? (
                <div className="text-center text-zinc-500 text-sm py-2">
                  Connect wallet to protect
                </div>
              ) : txStep === "done" ? (
                <div className="space-y-2">
                  <div className="text-center text-emerald-400 text-sm font-medium py-2">
                    Basket protected!
                  </div>
                  <Link href="/dashboard">
                    <Button className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10">
                      View Dashboard
                    </Button>
                  </Link>
                </div>
              ) : (
                <Button
                  onClick={handleProtect}
                  disabled={txStep !== "idle" || !parseFloat(amount)}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white border-0"
                >
                  {txStep !== "idle"
                    ? "Protecting..."
                    : `Protect ${basket.name} ($${basketAnalysis.totalPremium.toFixed(2)} premium)`}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
