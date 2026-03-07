"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useReadContracts } from "wagmi";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ORACLES, SUPPORTED_STOCKS } from "@/config/contracts";
import { PRICE_ORACLE_ABI } from "@/config/abi";

// ─── Pre-made basket definitions ────────────────────────────────────────────
const PREMADE_BASKETS = [
  {
    name: "KTECH",
    subtitle: "Tech Giants",
    description:
      "A weighted basket of the top tech-adjacent stocks on Robinhood Chain. Heavy on Tesla's AI play, balanced with cloud and data leaders.",
    stocks: [
      { ticker: "TSLA", weight: 40 },
      { ticker: "AMZN", weight: 30 },
      { ticker: "PLTR", weight: 20 },
      { ticker: "AMD", weight: 10 },
    ],
    gradient: "from-emerald-500/20 to-teal-500/20",
    accent: "emerald",
  },
  {
    name: "STREAMING",
    subtitle: "Entertainment",
    description:
      "Bet on content and cloud. Netflix leads the streaming wars, backed by Amazon's infrastructure and Palantir's data moat.",
    stocks: [
      { ticker: "NFLX", weight: 50 },
      { ticker: "AMZN", weight: 30 },
      { ticker: "PLTR", weight: 20 },
    ],
    gradient: "from-violet-500/20 to-purple-500/20",
    accent: "violet",
  },
  {
    name: "CHIPS & AI",
    subtitle: "Semiconductor + AI",
    description:
      "Pure AI infrastructure play. AMD chips power the models, Palantir deploys them, Tesla consumes them. The full AI stack.",
    stocks: [
      { ticker: "AMD", weight: 40 },
      { ticker: "PLTR", weight: 35 },
      { ticker: "TSLA", weight: 25 },
    ],
    gradient: "from-cyan-500/20 to-blue-500/20",
    accent: "cyan",
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function getStockMeta(ticker: string) {
  return SUPPORTED_STOCKS.find((s) => s.ticker === ticker);
}

/** Generate random-walk historical data from a current price, going back 24h */
function generateHistoricalData(
  currentPrice: number,
  seed: number
): { time: string; price: number }[] {
  const points: { time: string; price: number }[] = [];
  const intervals = 48; // 30-min intervals over 24h
  const now = Date.now();

  // Walk backwards from current price with controlled randomness
  let price = currentPrice;
  const prices: number[] = [price];

  // Use a seeded pseudo-random for deterministic-per-basket results
  let rng = seed;
  function nextRandom() {
    rng = (rng * 16807 + 0) % 2147483647;
    return (rng & 0x7fffffff) / 0x7fffffff;
  }

  for (let i = 1; i < intervals; i++) {
    const change = (nextRandom() - 0.48) * currentPrice * 0.008;
    price = price - change;
    prices.unshift(Math.max(price, currentPrice * 0.9));
  }

  // Build time-series
  for (let i = 0; i < intervals; i++) {
    const ts = now - (intervals - 1 - i) * 30 * 60 * 1000;
    const d = new Date(ts);
    const timeStr = `${d.getHours().toString().padStart(2, "0")}:${d
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
    points.push({ time: timeStr, price: Number(prices[i].toFixed(2)) });
  }

  return points;
}

// ─── Accent color map ───────────────────────────────────────────────────────
const accentColors: Record<string, { stroke: string; fill: string; text: string; bg: string; border: string }> = {
  emerald: {
    stroke: "#10B981",
    fill: "#10B981",
    text: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
  violet: {
    stroke: "#8B5CF6",
    fill: "#8B5CF6",
    text: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
  },
  cyan: {
    stroke: "#06B6D4",
    fill: "#06B6D4",
    text: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
  },
};

// ─── Custom tooltip ─────────────────────────────────────────────────────────
function ChartTooltip({
  active,
  payload,
  label,
  accentColor,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  accentColor: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold" style={{ color: accentColor }}>
        ${payload[0].value.toFixed(2)}
      </p>
    </div>
  );
}

// ─── Basket Card ────────────────────────────────────────────────────────────
function BasketShowcaseCard({
  basket,
  prices,
}: {
  basket: (typeof PREMADE_BASKETS)[number];
  prices: Record<string, number>;
}) {
  const accent = accentColors[basket.accent] ?? accentColors.emerald;

  // Calculate weighted basket price
  const basketPrice = useMemo(() => {
    let total = 0;
    let hasAllPrices = true;
    for (const s of basket.stocks) {
      const p = prices[s.ticker];
      if (p === undefined) {
        hasAllPrices = false;
        break;
      }
      total += p * (s.weight / 100);
    }
    return hasAllPrices ? total : null;
  }, [basket.stocks, prices]);

  // Generate chart data
  const chartData = useMemo(() => {
    if (basketPrice === null) return [];
    // Use basket name as seed for consistent random walk
    let seed = 0;
    for (let i = 0; i < basket.name.length; i++) {
      seed += basket.name.charCodeAt(i) * (i + 1) * 137;
    }
    return generateHistoricalData(basketPrice, seed);
  }, [basketPrice, basket.name]);

  const priceChange = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0].price;
    const last = chartData[chartData.length - 1].price;
    const change = last - first;
    const pct = (change / first) * 100;
    return { change, pct };
  }, [chartData]);

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden hover:border-white/10 transition-all duration-300 group">
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-xl font-bold text-white">{basket.name}</h3>
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${accent.bg} ${accent.text} ${accent.border} border`}
              >
                {basket.subtitle}
              </span>
            </div>
            <p className="text-sm text-zinc-500 max-w-sm">{basket.description}</p>
          </div>
          <div className="text-right shrink-0 ml-4">
            <div className={`text-2xl font-bold ${accent.text}`}>
              {basketPrice !== null ? `$${basketPrice.toFixed(2)}` : "..."}
            </div>
            {priceChange && (
              <div
                className={`text-xs font-medium mt-0.5 ${
                  priceChange.change >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {priceChange.change >= 0 ? "+" : ""}
                {priceChange.pct.toFixed(2)}% (24h)
              </div>
            )}
          </div>
        </div>

        {/* Stock composition pills with logos */}
        <div className="flex flex-wrap gap-2 mb-2">
          {basket.stocks.map((s) => {
            const meta = getStockMeta(s.ticker);
            const stockPrice = prices[s.ticker];
            return (
              <div
                key={s.ticker}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5"
              >
                {meta?.logo && (
                  <img
                    src={meta.logo}
                    alt={meta.name}
                    className="w-5 h-5 rounded-full"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
                <span className="text-xs font-semibold text-white">
                  {s.ticker}
                </span>
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: (meta?.color ?? "#888") + "20",
                    color: meta?.color ?? "#888",
                  }}
                >
                  {s.weight}%
                </span>
                {stockPrice !== undefined && (
                  <span className="text-[10px] text-zinc-500 font-mono">
                    ${stockPrice.toFixed(2)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      <div className="px-4 pb-2">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart
              data={chartData}
              margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id={`gradient-${basket.name}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={accent.stroke}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={accent.stroke}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#52525b", fontSize: 10 }}
                interval={11}
              />
              <YAxis
                domain={["auto", "auto"]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#52525b", fontSize: 10 }}
                width={55}
                tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              />
              <Tooltip
                content={
                  <ChartTooltip accentColor={accent.stroke} />
                }
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={accent.stroke}
                strokeWidth={2}
                fill={`url(#gradient-${basket.name})`}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: accent.stroke,
                  stroke: "#0a0a0a",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[180px] flex items-center justify-center text-zinc-600 text-sm">
            Loading price data...
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 pb-6 pt-2 flex items-center justify-between">
        <div className="flex gap-4 text-xs text-zinc-500">
          <span>
            <span className="text-zinc-300 font-medium">
              {basket.stocks.length}
            </span>{" "}
            stocks
          </span>
          <span>
            <span className="text-zinc-300 font-medium">24h</span> chart
          </span>
          <span>
            <span className="text-zinc-300 font-medium">30m</span> intervals
          </span>
        </div>
        <Link
          href="/protect-basket"
          className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${accent.bg} ${accent.text} ${accent.border} border hover:opacity-80`}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
          Protect This Basket
        </Link>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default function BasketsShowcase() {
  // Batch read all oracle prices
  const oracleTickers = Object.keys(ORACLES);
  const oraclePrices = useReadContracts({
    contracts: Object.entries(ORACLES).map(([, addr]) => ({
      address: addr,
      abi: PRICE_ORACLE_ABI,
      functionName: "latestPrice" as const,
    })),
    query: { enabled: true, refetchInterval: 30_000 },
  });

  // Parse oracle prices into a simple map
  const prices: Record<string, number> = {};
  if (oraclePrices.data) {
    oracleTickers.forEach((ticker, i) => {
      const result = oraclePrices.data?.[i];
      if (result?.status === "success" && result.result) {
        prices[ticker] = Number(result.result as bigint) / 1e8;
      }
    });
  }

  return (
    <div className="min-h-screen py-12">
      <div className="mx-auto max-w-6xl px-4">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-sm text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Pre-made baskets with live prices
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl mb-3">
            Stock Baskets
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-zinc-400">
            Curated stock index baskets with real-time weighted pricing from
            on-chain oracles. Pick a basket, then protect it with a single
            stop-loss.
          </p>
        </div>

        {/* Live price ticker bar */}
        <div className="mb-8 flex flex-wrap justify-center gap-3">
          {SUPPORTED_STOCKS.map((stock) => {
            const p = prices[stock.ticker];
            return (
              <div
                key={stock.ticker}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2"
              >
                {stock.logo && (
                  <img
                    src={stock.logo}
                    alt={stock.name}
                    className="w-4 h-4 rounded-full"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
                <span className="text-xs font-semibold text-white">
                  {stock.ticker}
                </span>
                <span className="text-xs font-mono text-emerald-400">
                  {p !== undefined ? `$${p.toFixed(2)}` : "..."}
                </span>
              </div>
            );
          })}
        </div>

        {/* Basket cards */}
        <div className="space-y-6">
          {PREMADE_BASKETS.map((basket) => (
            <BasketShowcaseCard
              key={basket.name}
              basket={basket}
              prices={prices}
            />
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-8">
            <h2 className="text-2xl font-bold text-white mb-2">
              Want a custom basket?
            </h2>
            <p className="text-zinc-400 mb-6 max-w-lg mx-auto">
              Create your own stock index with any weights. Deploy as an ERC-20
              in one transaction. No SEC approval. No minimum.
            </p>
            <Link
              href="/basket"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 text-sm font-medium transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Create Custom Basket
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
