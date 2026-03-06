"use client";

import { useReadContract, useReadContracts } from "wagmi";
import {
  VAULT_ADDRESS,
  INSURANCE_POOL_ADDRESS,
  BASKET_FACTORY_ADDRESS,
  PRIVATE_STOP_LOSS_ADDRESS,
  ORACLES,
  SUPPORTED_STOCKS,
} from "@/config/contracts";
import {
  STOP_LOSS_VAULT_ABI,
  GAP_INSURANCE_POOL_ABI,
  BASKET_FACTORY_ABI,
  PRIVATE_STOP_LOSS_ABI,
  PRICE_ORACLE_ABI,
} from "@/config/abi";

export default function AnalyticsPage() {
  const { data: vaultStats } = useReadContract({
    address: VAULT_ADDRESS,
    abi: STOP_LOSS_VAULT_ABI,
    functionName: "getStats",
    query: { refetchInterval: 15_000 },
  });

  const { data: poolStats } = useReadContract({
    address: INSURANCE_POOL_ADDRESS,
    abi: GAP_INSURANCE_POOL_ABI,
    functionName: "getStats",
    query: { refetchInterval: 15_000 },
  });

  const { data: utilization } = useReadContract({
    address: INSURANCE_POOL_ADDRESS,
    abi: GAP_INSURANCE_POOL_ABI,
    functionName: "utilizationBps",
    query: { refetchInterval: 15_000 },
  });

  const { data: basketCount } = useReadContract({
    address: BASKET_FACTORY_ADDRESS,
    abi: BASKET_FACTORY_ABI,
    functionName: "basketCount",
    query: { refetchInterval: 30_000 },
  });

  const { data: privateStats } = useReadContract({
    address: PRIVATE_STOP_LOSS_ADDRESS,
    abi: PRIVATE_STOP_LOSS_ABI,
    functionName: "getStats",
    query: { refetchInterval: 15_000 },
  });

  const oraclePrices = useReadContracts({
    contracts: Object.entries(ORACLES).map(([, addr]) => ({
      address: addr,
      abi: PRICE_ORACLE_ABI,
      functionName: "latestPrice" as const,
    })),
    query: { refetchInterval: 10_000 },
  });

  // Parse data
  const totalPositions = vaultStats ? Number((vaultStats as [bigint, bigint, bigint])[0]) : 0;
  const totalExecuted = vaultStats ? Number((vaultStats as [bigint, bigint, bigint])[1]) : 0;
  const totalProtectedUsd = vaultStats ? Number((vaultStats as [bigint, bigint, bigint])[2]) / 1e8 : 0;

  const poolBalance = poolStats ? Number((poolStats as [bigint, bigint, bigint, bigint, bigint])[1]) / 1e6 : 0;
  const totalPremiums = poolStats ? Number((poolStats as [bigint, bigint, bigint, bigint, bigint])[2]) / 1e6 : 0;
  const totalGapsPaid = poolStats ? Number((poolStats as [bigint, bigint, bigint, bigint, bigint])[3]) / 1e6 : 0;
  const numProviders = poolStats ? Number((poolStats as [bigint, bigint, bigint, bigint, bigint])[4]) : 0;

  const utilizationPct = utilization ? Number(utilization as bigint) / 100 : 0;
  const baskets = basketCount ? Number(basketCount as bigint) : 0;

  const privCommitted = privateStats ? Number((privateStats as [bigint, bigint, bigint])[0]) : 0;
  const privRevealed = privateStats ? Number((privateStats as [bigint, bigint, bigint])[1]) : 0;
  const privExecuted = privateStats ? Number((privateStats as [bigint, bigint, bigint])[2]) : 0;

  const tickers = Object.keys(ORACLES);
  const prices: Record<string, number> = {};
  if (oraclePrices.data) {
    tickers.forEach((t, i) => {
      const result = oraclePrices.data?.[i];
      if (result?.status === "success" && result.result) {
        prices[t] = Number(result.result as bigint) / 1e8;
      }
    });
  }

  const totalMarketCap = Object.values(prices).reduce((s, p) => s + p, 0);

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Protocol Analytics</h1>
          <p className="text-zinc-400 mt-1">Real-time on-chain data from StockForge contracts</p>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <MetricCard label="Total Value Protected" value={`$${totalProtectedUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub="Cumulative USD" color="emerald" />
          <MetricCard label="Pool Balance" value={`$${poolBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub={`${utilizationPct.toFixed(1)}% utilized`} color="cyan" />
          <MetricCard label="Premiums Earned" value={`$${totalPremiums.toFixed(2)}`} sub="Insurance revenue" color="violet" />
          <MetricCard label="Gaps Covered" value={`$${totalGapsPaid.toFixed(2)}`} sub="Paid to protect users" color="amber" />
        </div>

        {/* Two Column Layout */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Stop-Loss Activity */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <h2 className="text-lg font-semibold mb-4">Stop-Loss Activity</h2>
            <div className="space-y-4">
              <StatRow label="Total Positions Created" value={totalPositions.toString()} />
              <StatRow label="Positions Executed" value={totalExecuted.toString()} />
              <StatRow label="Active Positions" value={(totalPositions - totalExecuted).toString()} />
              <StatRow label="Execution Rate" value={totalPositions > 0 ? `${((totalExecuted / totalPositions) * 100).toFixed(1)}%` : "0%"} />

              <div className="border-t border-white/5 pt-4 mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-2 w-2 rounded-full bg-violet-400" />
                  <span className="text-sm font-medium text-violet-400">Private Stop-Losses (Commit-Reveal)</span>
                </div>
                <StatRow label="Committed (Hidden)" value={privCommitted.toString()} />
                <StatRow label="Revealed" value={privRevealed.toString()} />
                <StatRow label="Executed" value={privExecuted.toString()} />
              </div>
            </div>
          </div>

          {/* Insurance Pool Health */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <h2 className="text-lg font-semibold mb-4">Insurance Pool Health</h2>
            <div className="space-y-4">
              <StatRow label="Pool Balance" value={`$${poolBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
              <StatRow label="Total Deposited" value={`$${poolStats ? (Number((poolStats as [bigint, bigint, bigint, bigint, bigint])[0]) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "0"}`} />
              <StatRow label="Insurance Providers" value={numProviders.toString()} />
              <StatRow label="Premium Revenue" value={`$${totalPremiums.toFixed(2)}`} />
              <StatRow label="Gaps Paid Out" value={`$${totalGapsPaid.toFixed(2)}`} />

              {/* Utilization Bar */}
              <div className="pt-2">
                <div className="flex justify-between text-xs text-zinc-500 mb-1">
                  <span>Pool Utilization</span>
                  <span className={utilizationPct > 60 ? "text-amber-400" : "text-emerald-400"}>
                    {utilizationPct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-3 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      utilizationPct > 80 ? "bg-red-500" :
                      utilizationPct > 60 ? "bg-amber-500" :
                      "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(utilizationPct, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  {utilizationPct < 80 ? "Healthy capacity for new stop-losses" : "Pool approaching capacity limit"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Live Oracle Prices */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Live Oracle Prices</h2>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
            {SUPPORTED_STOCKS.map((stock) => {
              const price = prices[stock.ticker];
              return (
                <div key={stock.ticker} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: stock.color }} />
                    <span className="text-sm font-semibold">{stock.ticker}</span>
                  </div>
                  <div className="text-2xl font-bold font-mono text-emerald-400">
                    {price ? `$${price.toFixed(2)}` : "..."}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">{stock.name}</div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-zinc-500 mt-3 text-center">
            Prices update every 10s from on-chain oracles (Yahoo Finance feed)
          </p>
        </div>

        {/* Basket Factory Stats */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Basket Factory</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <MetricCard label="Baskets Created" value={baskets.toString()} sub="Permissionless ETFs" color="teal" />
            <MetricCard label="Supported Stocks" value="5" sub="TSLA, AMZN, PLTR, NFLX, AMD" color="blue" />
            <MetricCard label="Avg Oracle Price" value={totalMarketCap > 0 ? `$${(totalMarketCap / 5).toFixed(2)}` : "..."} sub="Across all tracked stocks" color="indigo" />
          </div>
        </div>

        {/* Architecture */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <h2 className="text-lg font-semibold mb-4">Contract Architecture</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { name: "StopLossVault", addr: VAULT_ADDRESS, desc: "Insurance-backed stop-losses with guaranteed execution" },
              { name: "GapInsurancePool", addr: INSURANCE_POOL_ADDRESS, desc: "Two-sided insurance market for gap coverage" },
              { name: "BasketFactory", addr: BASKET_FACTORY_ADDRESS, desc: "Permissionless stock basket creation (EIP-7621)" },
              { name: "PrivateStopLoss", addr: PRIVATE_STOP_LOSS_ADDRESS, desc: "Commit-reveal privacy for hidden stop prices" },
            ].map((c) => (
              <div key={c.name} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="text-sm font-semibold text-emerald-400 mb-1">{c.name}</div>
                <a
                  href={`https://explorer.testnet.chain.robinhood.com/address/${c.addr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors break-all"
                >
                  {c.addr}
                </a>
                <p className="text-xs text-zinc-400 mt-2">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-400",
    cyan: "text-cyan-400",
    violet: "text-violet-400",
    amber: "text-amber-400",
    teal: "text-teal-400",
    blue: "text-blue-400",
    indigo: "text-indigo-400",
  };
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colorMap[color] || "text-white"}`}>{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{sub}</div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className="text-sm font-mono text-white">{value}</span>
    </div>
  );
}
