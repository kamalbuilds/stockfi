"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  VAULT_ADDRESS,
  ORACLES,
  SUPPORTED_STOCKS,
  getStopLossStatusName,
  STOP_LOSS_STATUS_BG,
  distanceColor,
} from "@/config/contracts";
import { STOP_LOSS_VAULT_ABI, PRICE_ORACLE_ABI } from "@/config/abi";
import { formatAddress } from "@/lib/format";

function formatPrice8(price: bigint): string {
  return (Number(price) / 1e8).toFixed(2);
}

function formatAmount18(amount: bigint): string {
  return (Number(amount) / 1e18).toFixed(4);
}

function formatUsdc6(amount: bigint): string {
  return (Number(amount) / 1e6).toFixed(2);
}

export default function DashboardPage() {
  const { address } = useAccount();

  const { data: positionIds, isLoading: loadingIds } = useReadContract({
    address: VAULT_ADDRESS,
    abi: STOP_LOSS_VAULT_ABI,
    functionName: "getUserPositions",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!VAULT_ADDRESS },
  });

  const { data: vaultStats } = useReadContract({
    address: VAULT_ADDRESS,
    abi: STOP_LOSS_VAULT_ABI,
    functionName: "getStats",
    query: { enabled: !!VAULT_ADDRESS },
  });

  // Fetch oracle prices
  const oraclePrices = useReadContracts({
    contracts: Object.entries(ORACLES).map(([, addr]) => ({
      address: addr,
      abi: PRICE_ORACLE_ABI,
      functionName: "latestPrice" as const,
    })),
    query: { enabled: Object.values(ORACLES).some(Boolean) },
  });

  const tickers = Object.keys(ORACLES);
  const prices: Record<string, string> = {};
  if (oraclePrices.data) {
    tickers.forEach((t, i) => {
      const result = oraclePrices.data?.[i];
      if (result?.status === "success" && result.result) {
        prices[t] = formatPrice8(result.result as bigint);
      }
    });
  }

  const posIds = (positionIds as `0x${string}`[] | undefined) ?? [];

  return (
    <div className="min-h-screen py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
            {address && (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono">{formatAddress(address)}</span>
              </div>
            )}
          </div>
          <Link href="/create">
            <Button className="bg-emerald-500 hover:bg-emerald-600 text-white border-0">
              + New Stop-Loss
            </Button>
          </Link>
        </div>

        {/* Global Stats */}
        {vaultStats && (
          <div className="mb-8 grid grid-cols-3 gap-4">
            {[
              { label: "Total Positions", value: Number((vaultStats as [bigint, bigint, bigint])[0]).toString() },
              { label: "Executed", value: Number((vaultStats as [bigint, bigint, bigint])[1]).toString() },
              {
                label: "Total Protected",
                value: `$${formatPrice8((vaultStats as [bigint, bigint, bigint])[2])}`,
              },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center">
                <div className="text-2xl font-bold text-emerald-400">{stat.value}</div>
                <div className="text-xs text-zinc-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Positions */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Your Stop-Losses</h2>
              <span className="text-xs text-zinc-500">{posIds.length} position{posIds.length !== 1 ? "s" : ""}</span>
            </div>

            {!address ? (
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 text-center">
                <p className="text-zinc-400 mb-3">Connect your wallet to see your positions</p>
                <p className="text-zinc-600 text-sm">Or create your first stop-loss to get started.</p>
              </div>
            ) : loadingIds ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="h-40 rounded-xl bg-white/[0.02] border border-white/5 animate-pulse" />
                ))}
              </div>
            ) : posIds.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 text-center">
                <p className="text-zinc-400 mb-3">No stop-loss positions yet</p>
                <Link href="/create">
                  <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white border-0">
                    Create Your First Stop-Loss
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {posIds.map((posId) => (
                  <PositionCard key={posId} positionId={posId} />
                ))}
              </div>
            )}
          </div>

          {/* Live Prices Sidebar */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Live Prices</h2>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
              {SUPPORTED_STOCKS.map((stock) => (
                <div key={stock.ticker} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img src={stock.logo} alt={stock.name} className="h-5 w-5 rounded-full bg-white/10 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <span className="text-sm font-medium text-zinc-300">{stock.ticker}</span>
                  </div>
                  <span className="text-sm font-mono text-emerald-400">
                    {prices[stock.ticker] ? `$${prices[stock.ticker]}` : "—"}
                  </span>
                </div>
              ))}
              <p className="text-xs text-zinc-600 pt-1">Updated by bot every 30s</p>
            </div>

            <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <h3 className="text-sm font-medium text-zinc-400 mb-3">Network</h3>
              <div className="space-y-1 text-xs text-zinc-500">
                <div className="flex justify-between">
                  <span>Chain</span>
                  <span className="text-zinc-300">Robinhood Chain (46630)</span>
                </div>
                <div className="flex justify-between">
                  <span>Explorer</span>
                  <a
                    href="https://explorer.testnet.chain.robinhood.com"
                    target="_blank"
                    rel="noopener"
                    className="text-emerald-400 hover:underline"
                  >
                    Blockscout
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PositionCard({ positionId }: { positionId: `0x${string}` }) {
  const { data: pos } = useReadContract({
    address: VAULT_ADDRESS,
    abi: STOP_LOSS_VAULT_ABI,
    functionName: "getPosition",
    args: [positionId],
    query: { enabled: !!VAULT_ADDRESS },
  });

  const { data: distPct } = useReadContract({
    address: VAULT_ADDRESS,
    abi: STOP_LOSS_VAULT_ABI,
    functionName: "getDistanceToStop",
    args: [positionId],
    query: { enabled: !!VAULT_ADDRESS },
  });

  if (!pos) {
    return (
      <div className="h-40 rounded-xl bg-white/[0.02] border border-white/5 animate-pulse" />
    );
  }

  const position = pos as {
    ticker: string;
    amount: bigint;
    stopPrice: bigint;
    premiumPaid: bigint;
    status: number;
    createdAt: bigint;
    executedAt: bigint;
    marketPriceAtExecution: bigint;
  };

  const statusName = getStopLossStatusName(position.status);
  const dist = distPct ? Number(distPct as bigint) : 0;

  return (
    <Link href={`/position?id=${positionId}`} className="block rounded-xl border border-white/5 bg-white/[0.02] p-5 hover:border-emerald-500/30 transition-colors cursor-pointer">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg font-bold text-white">{position.ticker}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${STOP_LOSS_STATUS_BG[statusName]}`}>
              {statusName}
            </span>
          </div>
          <div className="text-sm text-zinc-400">
            {formatAmount18(position.amount)} shares
          </div>
        </div>
        {position.status === 0 && dist > 0 && (
          <div className="text-right">
            <div className={`text-sm font-semibold ${distanceColor(dist)}`}>
              {dist}% above stop
            </div>
            <div className="text-xs text-zinc-600">distance to stop</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-zinc-500 text-xs mb-0.5">Stop Price</div>
          <div className="text-white font-semibold">${formatPrice8(position.stopPrice)}</div>
        </div>
        <div>
          <div className="text-zinc-500 text-xs mb-0.5">Premium Paid</div>
          <div className="text-white">${formatUsdc6(position.premiumPaid)} USDC</div>
        </div>
        {position.status === 1 && (
          <>
            <div>
              <div className="text-zinc-500 text-xs mb-0.5">Market Price at Execution</div>
              <div className="text-red-400">${formatPrice8(position.marketPriceAtExecution)}</div>
            </div>
            <div>
              <div className="text-zinc-500 text-xs mb-0.5">Gap Covered</div>
              <div className="text-emerald-400">
                ${formatPrice8(position.stopPrice - position.marketPriceAtExecution)}/share
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-3 text-xs text-zinc-600 font-mono">
        {positionId.slice(0, 10)}...{positionId.slice(-8)}
      </div>
    </Link>
  );
}
