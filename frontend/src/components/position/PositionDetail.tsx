"use client";

import { useReadContract } from "wagmi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatAddress } from "@/lib/format";
import {
  VAULT_ADDRESS,
  getStopLossStatusName,
  STOP_LOSS_STATUS_COLORS,
  STOP_LOSS_STATUS_BG,
  distanceColor,
  RH_CHAIN_EXPLORER,
} from "@/config/contracts";
import { STOP_LOSS_VAULT_ABI } from "@/config/abi";

interface PositionDetailProps {
  positionId: `0x${string}`;
}

function formatPrice8(price: bigint): string {
  return (Number(price) / 1e8).toFixed(2);
}

function formatAmount18(amount: bigint): string {
  return (Number(amount) / 1e18).toFixed(4);
}

function formatUsdc6(amount: bigint): string {
  return (Number(amount) / 1e6).toFixed(2);
}

export function PositionDetail({ positionId }: PositionDetailProps) {
  const { data: pos, isLoading, error } = useReadContract({
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

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2].map((i) => (
          <Card key={i} className="bg-white/[0.02] border-white/5 animate-pulse">
            <CardContent className="h-48" />
          </Card>
        ))}
      </div>
    );
  }

  if (error || !pos) {
    return (
      <Card className="bg-white/[0.02] border-white/5">
        <CardContent className="py-12 text-center">
          <div className="text-red-400 text-lg font-semibold mb-2">Position Not Found</div>
          <div className="text-zinc-500 text-sm">Could not load position data.</div>
          <div className="text-zinc-600 text-xs mt-4 font-mono">{positionId}</div>
        </CardContent>
      </Card>
    );
  }

  const position = pos as {
    owner: string;
    stockToken: string;
    ticker: string;
    amount: bigint;
    stopPrice: bigint;
    premiumPaid: bigint;
    priceOracle: string;
    status: number;
    createdAt: bigint;
    executedAt: bigint;
    marketPriceAtExecution: bigint;
  };

  const statusName = getStopLossStatusName(position.status);
  const dist = distPct ? Number(distPct as bigint) : 0;
  const stopPriceUsd = Number(position.stopPrice) / 1e8;
  const amountTokens = Number(position.amount) / 1e18;
  const positionValueUsd = amountTokens * stopPriceUsd;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-white">{position.ticker} Stop-Loss</h1>
            <Badge
              variant="outline"
              className={`${STOP_LOSS_STATUS_BG[statusName] || ""} ${STOP_LOSS_STATUS_COLORS[statusName] || ""}`}
            >
              {statusName}
            </Badge>
          </div>
          <div className="text-xs text-zinc-500 font-mono break-all">{positionId}</div>
        </div>
        {position.status === 0 && dist > 0 && (
          <div className="text-right">
            <div className={`text-3xl font-bold ${distanceColor(dist)}`}>
              {dist - 100}%
            </div>
            <div className="text-xs text-zinc-500">above stop price</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white/[0.02] border-white/5">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-400">Position Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-zinc-500 block">Stock</span>
                <span className="text-lg font-bold text-white">{position.ticker}</span>
              </div>
              <div>
                <span className="text-xs text-zinc-500 block">Amount</span>
                <span className="text-lg font-bold text-white">{formatAmount18(position.amount)} shares</span>
              </div>
              <div>
                <span className="text-xs text-zinc-500 block">Guaranteed Stop Price</span>
                <span className="text-lg font-bold text-[#00D4AA]">${formatPrice8(position.stopPrice)}</span>
              </div>
              <div>
                <span className="text-xs text-zinc-500 block">Protected Value</span>
                <span className="text-lg font-bold text-white">
                  ${positionValueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-xs text-zinc-500 block">Premium Paid</span>
                <span className="text-sm text-zinc-300">${formatUsdc6(position.premiumPaid)} USDC</span>
              </div>
              <div>
                <span className="text-xs text-zinc-500 block">Created</span>
                <span className="text-sm text-zinc-300">
                  {position.createdAt > 0n
                    ? new Date(Number(position.createdAt) * 1000).toLocaleString()
                    : "N/A"}
                </span>
              </div>
            </div>
            <div className="pt-3 border-t border-white/5">
              <span className="text-xs text-zinc-500 block">Owner</span>
              <span className="text-xs text-zinc-400 font-mono">{position.owner}</span>
            </div>
          </CardContent>
        </Card>

        {position.status === 1 && position.marketPriceAtExecution > 0n && (
          <Card className="bg-blue-500/5 border-blue-500/20">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-blue-400">Gap Coverage Report</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-zinc-500 block">Market Price at Execution</span>
                  <span className="text-xl font-bold text-red-400">${formatPrice8(position.marketPriceAtExecution)}</span>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 block">Your Guaranteed Price</span>
                  <span className="text-xl font-bold text-[#00D4AA]">${formatPrice8(position.stopPrice)}</span>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 block">Gap Per Share</span>
                  <span className="text-xl font-bold text-blue-400">
                    ${((Number(position.stopPrice) - Number(position.marketPriceAtExecution)) / 1e8).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 block">Total Gap Covered</span>
                  <span className="text-xl font-bold text-blue-400">
                    ${(amountTokens * (Number(position.stopPrice) - Number(position.marketPriceAtExecution)) / 1e8).toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 text-sm text-blue-300">
                The insurance pool absorbed the gap between market price and your guaranteed price.
                In TradFi, you would have received ${formatPrice8(position.marketPriceAtExecution)}/share instead of ${formatPrice8(position.stopPrice)}/share.
              </div>
            </CardContent>
          </Card>
        )}

        {position.status === 0 && (
          <Card className="bg-white/[0.02] border-white/5">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-zinc-400">How It Works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-zinc-400">
              <p>Your {position.ticker} tokens are held in the StopLossVault.</p>
              <p>When the oracle price drops to or below <span className="text-[#00D4AA] font-semibold">${formatPrice8(position.stopPrice)}</span>, the bot executes your stop-loss.</p>
              <p>You receive USDC at exactly your guaranteed price, regardless of how far the market drops.</p>
              <p>The insurance pool covers any gap between market price and your stop price.</p>
              <a
                href={`${RH_CHAIN_EXPLORER}/address/${VAULT_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs text-emerald-400 hover:underline mt-2"
              >
                View contract on explorer
              </a>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
