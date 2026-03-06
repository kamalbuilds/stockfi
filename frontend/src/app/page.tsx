"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
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
            Your stop-loss.
            <br />
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              Guaranteed.
            </span>
          </h1>

          <p className="mx-auto mb-4 max-w-2xl text-xl text-zinc-400">
            Your stop-loss at $270 fills at $250 after a gap. You lose $20/share.
          </p>
          <p className="mx-auto mb-10 max-w-2xl text-xl text-white font-semibold">
            On StockForge, you get exactly $270. No matter what.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/create">
              <Button size="lg" className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 px-8">
                Create Stop-Loss
              </Button>
            </Link>
            <Link href="/insurance">
              <Button size="lg" variant="outline" className="border-white/10 bg-white/5 text-white px-8">
                Provide Insurance
              </Button>
            </Link>
          </div>
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
                Goldman Sachs can&apos;t solve this. Markets close.
              </li>
            </ul>
          </div>

          {/* StockForge */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-lg bg-emerald-500/20 p-2">
                <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-emerald-400">StockForge Stop-Loss</h3>
            </div>
            <ul className="space-y-3 text-zinc-400 text-sm">
              <li className="flex gap-2">
                <span className="text-emerald-400 shrink-0">+</span>
                DeFi never closes. No overnight gaps.
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400 shrink-0">+</span>
                Stop at $270, fills at exactly $270. Guaranteed.
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400 shrink-0">+</span>
                Insurance pool pre-funds the guaranteed price.
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400 shrink-0">+</span>
                Only possible on Robinhood Chain. New primitive.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="mx-auto max-w-5xl px-4 pb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              step: "01",
              title: "Deposit & Set Stop",
              desc: "Deposit your TSLA/AMZN/PLTR tokens and set your guaranteed stop-loss price. Pay a 2% premium to the insurance pool.",
              color: "text-emerald-400",
            },
            {
              step: "02",
              title: "Insurance Backs It",
              desc: "Insurance providers deposit USDC to earn yield from premiums. They pre-fund every stop-loss at the guaranteed price.",
              color: "text-teal-400",
            },
            {
              step: "03",
              title: "Guaranteed Execution",
              desc: "When price drops to your stop, you receive USDC at your guaranteed price regardless of where the market is.",
              color: "text-cyan-400",
            },
          ].map((item) => (
            <div key={item.step} className="rounded-xl border border-white/5 bg-white/2 p-6">
              <div className={`mb-3 text-3xl font-bold ${item.color}`}>{item.step}</div>
              <h3 className="mb-2 text-lg font-semibold text-white">{item.title}</h3>
              <p className="text-sm text-zinc-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Supported Stocks */}
      <section className="mx-auto max-w-5xl px-4 pb-24">
        <h2 className="mb-8 text-center text-2xl font-bold">Supported Stocks</h2>
        <div className="flex flex-wrap justify-center gap-3">
          {["TSLA", "AMZN", "PLTR", "NFLX", "AMD"].map((ticker) => (
            <div
              key={ticker}
              className="rounded-lg border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white"
            >
              {ticker}
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-sm text-zinc-500">
          Tokenized stocks on Robinhood Chain Testnet (chain 46630)
        </p>
      </section>
    </div>
  );
}
