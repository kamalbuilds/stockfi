"use client";

import Link from "next/link";
import { useReadContracts, useReadContract } from "wagmi";
import { Button } from "@/components/ui/button";
import {
  VAULT_ADDRESS,
  INSURANCE_POOL_ADDRESS,
  BASKET_FACTORY_ADDRESS,
  ORACLES,
  SUPPORTED_STOCKS,
} from "@/config/contracts";
import { STOP_LOSS_VAULT_ABI, GAP_INSURANCE_POOL_ABI, BASKET_FACTORY_ABI, PRICE_ORACLE_ABI } from "@/config/abi";

export default function Home() {
  const { data: vaultStats } = useReadContract({
    address: VAULT_ADDRESS,
    abi: STOP_LOSS_VAULT_ABI,
    functionName: "getStats",
    query: { enabled: !!VAULT_ADDRESS },
  });

  const { data: poolStats } = useReadContract({
    address: INSURANCE_POOL_ADDRESS,
    abi: GAP_INSURANCE_POOL_ABI,
    functionName: "getStats",
    query: { enabled: !!INSURANCE_POOL_ADDRESS },
  });

  const { data: basketCount } = useReadContract({
    address: BASKET_FACTORY_ADDRESS,
    abi: BASKET_FACTORY_ABI,
    functionName: "basketCount",
    query: { enabled: !!BASKET_FACTORY_ADDRESS },
  });

  const oraclePrices = useReadContracts({
    contracts: Object.entries(ORACLES).map(([, addr]) => ({
      address: addr,
      abi: PRICE_ORACLE_ABI,
      functionName: "latestPrice" as const,
    })),
    query: { enabled: true, refetchInterval: 30_000 },
  });

  const tickers = Object.keys(ORACLES);
  const prices: Record<string, string> = {};
  if (oraclePrices.data) {
    tickers.forEach((t, i) => {
      const result = oraclePrices.data?.[i];
      if (result?.status === "success" && result.result) {
        prices[t] = (Number(result.result as bigint) / 1e8).toFixed(2);
      }
    });
  }

  const totalPositions = vaultStats ? Number((vaultStats as [bigint, bigint, bigint])[0]) : 0;
  const totalExecuted = vaultStats ? Number((vaultStats as [bigint, bigint, bigint])[1]) : 0;
  const poolBalance = poolStats ? (Number((poolStats as [bigint, bigint, bigint, bigint, bigint])[1]) / 1e6).toFixed(0) : "0";
  const premiums = poolStats ? (Number((poolStats as [bigint, bigint, bigint, bigint, bigint])[2]) / 1e6).toFixed(2) : "0";
  const baskets = basketCount ? Number(basketCount as bigint) : 0;

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden pt-20 pb-32">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/20 to-transparent pointer-events-none" />
        <div className="mx-auto max-w-5xl px-4 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-sm text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Live on Robinhood Chain Testnet
          </div>

          <h1 className="mb-6 text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            DeFi primitives for
            <br />
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              tokenized stocks.
            </span>
          </h1>

          <p className="mx-auto mb-4 max-w-2xl text-xl text-zinc-400">
            Create custom stock indexes. Insure them with one click. No SEC approval. No $250K minimum.
          </p>
          <p className="mx-auto mb-10 max-w-2xl text-xl text-white font-semibold">
            Permissionless baskets + insurance-backed stop-losses. Built natively for Robinhood Chain.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/basket">
              <Button size="lg" className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 px-8">
                Create a Basket
              </Button>
            </Link>
            <Link href="/create">
              <Button size="lg" variant="outline" className="border-white/10 bg-white/5 text-white px-8">
                Protect with Stop-Loss
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Live Protocol Stats */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Stop-Losses", value: totalPositions.toString() },
            { label: "Executed", value: totalExecuted.toString() },
            { label: "Pool Balance", value: `$${Number(poolBalance).toLocaleString()}` },
            { label: "Premiums Earned", value: `$${premiums}` },
            { label: "Baskets Created", value: baskets.toString() },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center">
              <div className="text-xl font-bold text-emerald-400">{stat.value}</div>
              <div className="text-xs text-zinc-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* TradFi vs DeFi comparison */}
      <section className="mx-auto max-w-6xl px-4 pb-24">
        <div className="grid md:grid-cols-2 gap-6">
          {/* TradFi */}
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-lg bg-red-500/20 p-2">
                <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-red-400">TradFi Stop-Loss</h3>
            </div>
            <ul className="space-y-3 text-zinc-400 text-sm">
              <li className="flex gap-2">
                <span className="text-red-400 shrink-0">x</span>
                Markets close overnight. Stock gaps at open.
              </li>
              <li className="flex gap-2">
                <span className="text-red-400 shrink-0">x</span>
                Stop at $270, fills at $250. You lose $20/share.
              </li>
              <li className="flex gap-2">
                <span className="text-red-400 shrink-0">x</span>
                No recourse. The broker can&apos;t do anything.
              </li>
              <li className="flex gap-2">
                <span className="text-red-400 shrink-0">x</span>
                Put options exist but require options knowledge and have expiry dates.
              </li>
            </ul>
          </div>

          {/* StockFi */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-lg bg-emerald-500/20 p-2">
                <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-emerald-400">StockFi Stop-Loss</h3>
            </div>
            <ul className="space-y-3 text-zinc-400 text-sm">
              <li className="flex gap-2">
                <span className="text-emerald-400 shrink-0">+</span>
                DeFi never closes. No overnight gaps.
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400 shrink-0">+</span>
                Stop at $270, insurance pool pays you $270. Pre-funded.
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400 shrink-0">+</span>
                Insurance pool pre-funds the guaranteed price.
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400 shrink-0">+</span>
                First permissionless insurance market for tokenized stocks.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="mx-auto max-w-5xl px-4 pb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">How It Works</h2>
        <div className="grid md:grid-cols-4 gap-6">
          {[
            {
              step: "01",
              title: "Create a Basket",
              desc: "Pick your stocks and weights. KTECH = 40% TSLA + 30% AMZN + 20% PLTR + 10% AMD. Deployed as an ERC-20 in one tx.",
              color: "text-emerald-400",
            },
            {
              step: "02",
              title: "Mint Basket Tokens",
              desc: "Deposit proportional stock tokens. Receive basket tokens representing your custom index. Burn to redeem anytime.",
              color: "text-teal-400",
            },
            {
              step: "03",
              title: "Insure with Stop-Loss",
              desc: "Set a stop price on your basket (or individual stocks). Pay 2% premium. Insurance pool pre-funds your guaranteed price.",
              color: "text-cyan-400",
            },
            {
              step: "04",
              title: "Sleep Soundly",
              desc: "Price bot monitors 24/7. If price drops to your stop, the pool pays you at the insured price. No gaps, no slippage.",
              color: "text-violet-400",
            },
          ].map((item) => (
            <div key={item.step} className="rounded-xl border border-white/5 bg-white/[0.02] p-6">
              <div className={`mb-3 text-3xl font-bold ${item.color}`}>{item.step}</div>
              <h3 className="mb-2 text-lg font-semibold text-white">{item.title}</h3>
              <p className="text-sm text-zinc-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Supported Stocks with Live Prices */}
      <section className="mx-auto max-w-5xl px-4 pb-24">
        <h2 className="mb-8 text-center text-2xl font-bold">Live Oracle Prices</h2>
        <div className="flex flex-wrap justify-center gap-3">
          {SUPPORTED_STOCKS.map((stock) => (
            <div
              key={stock.ticker}
              className="rounded-lg border border-white/10 bg-white/5 px-6 py-4 flex items-center gap-4 min-w-[160px]"
            >
              <img
                src={stock.logo}
                alt={stock.name}
                className="h-8 w-8 rounded-full bg-white/10 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div>
                <div className="text-sm font-semibold text-white">{stock.ticker}</div>
                <div className="text-lg font-mono text-emerald-400">
                  {prices[stock.ticker] ? `$${prices[stock.ticker]}` : "..."}
                </div>
                <div className="text-xs text-zinc-500">{stock.name}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-sm text-zinc-500">
          Prices update every 10s from on-chain oracles (Yahoo Finance feed)
        </p>
      </section>
    </div>
  );
}
