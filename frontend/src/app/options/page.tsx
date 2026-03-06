"use client";

import { useState } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { Button } from "@/components/ui/button";
import {
  COVERED_CALL_ADDRESS,
  ORACLES,
  STOCK_TOKENS,
  USDC_ADDRESS,
  SUPPORTED_STOCKS,
} from "@/config/contracts";
import { COVERED_CALL_ABI, PRICE_ORACLE_ABI, ERC20_ABI } from "@/config/abi";

function formatPrice8(price: bigint): string {
  return (Number(price) / 1e8).toFixed(2);
}

function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return "Expired";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

const STATUS_NAMES: Record<number, string> = {
  0: "OPEN",
  1: "BOUGHT",
  2: "EXERCISED",
  3: "EXPIRED",
  4: "CANCELLED",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  BOUGHT: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  EXERCISED: "text-purple-400 bg-purple-400/10 border-purple-400/30",
  EXPIRED: "text-gray-400 bg-gray-400/10 border-gray-400/30",
  CANCELLED: "text-gray-400 bg-gray-400/10 border-gray-400/30",
};

export default function OptionsPage() {
  const { address } = useAccount();
  const [activeTab, setActiveTab] = useState<"write" | "market" | "my">("write");

  return (
    <div className="min-h-screen py-12">
      <div className="mx-auto max-w-4xl px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Covered Call Options</h1>
          <p className="text-zinc-400 text-sm">
            Earn yield on your stock tokens by writing covered calls. Buyers get leveraged upside exposure.
          </p>
        </div>

        {/* Stats */}
        <OptionsStats />

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(["write", "market", "my"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === tab
                  ? "bg-amber-500/20 border border-amber-500/50 text-amber-400"
                  : "bg-white/5 border border-white/10 text-zinc-400 hover:border-white/20"
              }`}
            >
              {tab === "write" ? "Write Call" : tab === "market" ? "Options Market" : "My Options"}
            </button>
          ))}
        </div>

        {activeTab === "write" && <WriteCallForm />}
        {activeTab === "market" && <OptionsMarket />}
        {activeTab === "my" && <MyOptions />}
      </div>
    </div>
  );
}

function OptionsStats() {
  const { data: stats } = useReadContract({
    address: COVERED_CALL_ADDRESS,
    abi: COVERED_CALL_ABI,
    functionName: "getStats",
    query: { refetchInterval: 10000 },
  });

  const [written, bought, exercised, expired, premiums, volume] = (stats as [bigint, bigint, bigint, bigint, bigint, bigint]) ?? [0n, 0n, 0n, 0n, 0n, 0n];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {[
        { label: "Options Written", value: Number(written) },
        { label: "Options Bought", value: Number(bought) },
        { label: "Premiums Earned", value: `$${(Number(premiums) / 1e6).toFixed(2)}` },
        { label: "Exercise Volume", value: `$${(Number(volume) / 1e8).toFixed(0)}` },
      ].map((s) => (
        <div key={s.label} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <p className="text-xs text-zinc-500 mb-1">{s.label}</p>
          <p className="text-lg font-bold text-white">{s.value}</p>
        </div>
      ))}
    </div>
  );
}

function WriteCallForm() {
  const { address } = useAccount();
  const [ticker, setTicker] = useState("TSLA");
  const [amount, setAmount] = useState("");
  const [strikePrice, setStrikePrice] = useState("");
  const [premium, setPremium] = useState("");
  const [durationDays, setDurationDays] = useState("7");
  const [txStep, setTxStep] = useState<"idle" | "approve" | "write" | "done">("idle");

  const oracleAddress = ORACLES[ticker];
  const stockTokenAddress = STOCK_TOKENS[ticker];

  const { data: currentPriceRaw } = useReadContract({
    address: oracleAddress,
    abi: PRICE_ORACLE_ABI,
    functionName: "latestPrice",
    query: { enabled: !!oracleAddress },
  });

  const currentPrice = currentPriceRaw ? formatPrice8(currentPriceRaw as bigint) : null;

  const { writeContractAsync } = useWriteContract();
  const [pendingTxHash, setPendingTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: waitingForTx } = useWaitForTransactionReceipt({ hash: pendingTxHash });

  const yieldPreview = (() => {
    if (!amount || !premium || !currentPriceRaw) return null;
    const amountFloat = parseFloat(amount);
    const premiumFloat = parseFloat(premium);
    const priceFloat = Number(currentPriceRaw as bigint) / 1e8;
    if (isNaN(amountFloat) || isNaN(premiumFloat) || amountFloat <= 0) return null;
    const positionValue = amountFloat * priceFloat;
    const yieldPct = (premiumFloat / positionValue) * 100;
    const daysFloat = parseFloat(durationDays) || 7;
    const annualized = (yieldPct * 365) / daysFloat;
    return { yieldPct: yieldPct.toFixed(2), annualized: annualized.toFixed(1) };
  })();

  async function handleWrite() {
    if (!address || !stockTokenAddress || !oracleAddress) return;
    if (!amount || !strikePrice || !premium) return;

    const amountWei = parseUnits(amount, 18);
    const strikePriceRaw = BigInt(Math.round(parseFloat(strikePrice) * 1e8));
    const premiumUsdc = parseUnits(premium, 6);
    const expiry = BigInt(Math.floor(Date.now() / 1000) + parseInt(durationDays) * 86400);

    setTxStep("approve");
    try {
      const approveTx = await writeContractAsync({
        address: stockTokenAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [COVERED_CALL_ADDRESS, amountWei],
      });
      setPendingTxHash(approveTx);

      setTxStep("write");
      const writeTx = await writeContractAsync({
        address: COVERED_CALL_ADDRESS,
        abi: COVERED_CALL_ABI,
        functionName: "writeCall",
        args: [stockTokenAddress, ticker, amountWei, strikePriceRaw, premiumUsdc, expiry, oracleAddress],
      });
      setPendingTxHash(writeTx);
      setTxStep("done");
    } catch (err) {
      console.error("Write call failed:", err);
      setTxStep("idle");
    }
  }

  const isValid = (() => {
    if (!amount || !strikePrice || !premium || !currentPriceRaw) return false;
    const strikeFloat = parseFloat(strikePrice);
    const currFloat = Number(currentPriceRaw as bigint) / 1e8;
    return strikeFloat > currFloat && parseFloat(amount) > 0 && parseFloat(premium) > 0;
  })();

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 space-y-6">
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-3">Stock Token</label>
        <div className="flex flex-wrap gap-2">
          {SUPPORTED_STOCKS.map((stock) => (
            <button
              key={stock.ticker}
              onClick={() => setTicker(stock.ticker)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                ticker === stock.ticker
                  ? "bg-amber-500/20 border border-amber-500/50 text-amber-400"
                  : "bg-white/5 border border-white/10 text-zinc-400 hover:border-white/20"
              }`}
            >
              {stock.ticker}
            </button>
          ))}
        </div>
        {currentPrice && (
          <p className="mt-2 text-xs text-zinc-500">
            Current price: <span className="text-amber-400 font-mono">${currentPrice}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Amount ({ticker})</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 10"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-zinc-600 focus:border-amber-500/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            Strike Price (USD)
            {currentPrice && <span className="ml-1 text-zinc-500">above ${currentPrice}</span>}
          </label>
          <input
            type="number"
            value={strikePrice}
            onChange={(e) => setStrikePrice(e.target.value)}
            placeholder="e.g. 400"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-zinc-600 focus:border-amber-500/50 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Premium (USDC)</label>
          <input
            type="number"
            value={premium}
            onChange={(e) => setPremium(e.target.value)}
            placeholder="e.g. 500"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-zinc-600 focus:border-amber-500/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Duration (Days)</label>
          <select
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-amber-500/50 focus:outline-none"
          >
            <option value="1">1 Day</option>
            <option value="3">3 Days</option>
            <option value="7">7 Days</option>
            <option value="14">14 Days</option>
            <option value="30">30 Days</option>
          </select>
        </div>
      </div>

      {yieldPreview && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">Yield on Position</span>
            <span className="font-semibold text-amber-400">{yieldPreview.yieldPct}%</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-1">
            <span className="text-zinc-400">Annualized Yield</span>
            <span className="font-semibold text-amber-400">{yieldPreview.annualized}% APY</span>
          </div>
          <p className="mt-2 text-xs text-zinc-600">
            If {ticker} stays below ${strikePrice}, you keep your tokens + earn ${premium} USDC.
          </p>
        </div>
      )}

      {txStep !== "idle" && txStep !== "done" && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-400">
          {txStep === "approve" && "Step 1/2: Approving stock token transfer..."}
          {txStep === "write" && "Step 2/2: Writing covered call option..."}
          {waitingForTx && " (waiting for confirmation)"}
        </div>
      )}

      {txStep === "done" && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-400">
          Covered call written! Your {ticker} tokens are locked. You will earn ${premium} USDC premium when a buyer purchases your option.
        </div>
      )}

      {!address ? (
        <div className="text-center text-zinc-500 text-sm">Connect your wallet to write covered calls</div>
      ) : txStep === "done" ? null : (
        <Button
          onClick={handleWrite}
          disabled={!isValid || txStep !== "idle"}
          className="w-full bg-amber-500 hover:bg-amber-600 text-white border-0 py-3"
        >
          {txStep !== "idle" ? "Writing..." : `Write ${ticker} Covered Call`}
        </Button>
      )}

      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-sm text-zinc-500">
        <p className="font-medium text-zinc-400 mb-2">How Covered Calls Work</p>
        <ol className="space-y-1 list-decimal list-inside">
          <li>You deposit {ticker || "stock"} tokens and set a strike price above current market</li>
          <li>A buyer pays you the premium in USDC for the right to exercise</li>
          <li>If {ticker || "stock"} stays below strike at expiry: you keep tokens + premium (profit)</li>
          <li>If {ticker || "stock"} exceeds strike: buyer exercises, you receive strike price in USDC</li>
        </ol>
      </div>
    </div>
  );
}

function OptionsMarket() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [buying, setBuying] = useState<string | null>(null);

  // For demo, show a message about options marketplace
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
      <div className="text-center py-8">
        <div className="text-4xl mb-4">&#x1F4C8;</div>
        <h3 className="text-xl font-bold text-white mb-2">Options Marketplace</h3>
        <p className="text-zinc-400 text-sm max-w-md mx-auto mb-6">
          Browse and buy open covered call options written by other users.
          Pay the premium in USDC to gain the right to exercise if the stock rises above the strike price.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left max-w-lg mx-auto">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-xs text-zinc-500 mb-1">For Writers</p>
            <p className="text-sm text-amber-400 font-medium">Earn premium income on idle stock tokens</p>
          </div>
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
            <p className="text-xs text-zinc-500 mb-1">For Buyers</p>
            <p className="text-sm text-blue-400 font-medium">Leveraged upside at a fraction of the cost</p>
          </div>
          <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
            <p className="text-xs text-zinc-500 mb-1">Settlement</p>
            <p className="text-sm text-purple-400 font-medium">Instant on-chain, no broker needed</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MyOptions() {
  const { address } = useAccount();

  const { data: writerOptionIds } = useReadContract({
    address: COVERED_CALL_ADDRESS,
    abi: COVERED_CALL_ABI,
    functionName: "getWriterOptions",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: buyerOptionIds } = useReadContract({
    address: COVERED_CALL_ADDRESS,
    abi: COVERED_CALL_ABI,
    functionName: "getBuyerOptions",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const allIds = [
    ...((writerOptionIds as `0x${string}`[]) || []),
    ...((buyerOptionIds as `0x${string}`[]) || []),
  ];
  const uniqueIds = [...new Set(allIds)];

  if (!address) {
    return (
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 text-center text-zinc-500">
        Connect your wallet to view your options
      </div>
    );
  }

  if (uniqueIds.length === 0) {
    return (
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 text-center">
        <p className="text-zinc-500">No options yet. Write your first covered call!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {uniqueIds.map((id) => (
        <OptionCard key={id} optionId={id} userAddress={address} />
      ))}
    </div>
  );
}

function OptionCard({ optionId, userAddress }: { optionId: `0x${string}`; userAddress: `0x${string}` }) {
  const { data: option } = useReadContract({
    address: COVERED_CALL_ADDRESS,
    abi: COVERED_CALL_ABI,
    functionName: "getOption",
    args: [optionId],
  });

  const { data: tte } = useReadContract({
    address: COVERED_CALL_ADDRESS,
    abi: COVERED_CALL_ABI,
    functionName: "timeToExpiry",
    args: [optionId],
    query: { refetchInterval: 30000 },
  });

  const { data: itm } = useReadContract({
    address: COVERED_CALL_ADDRESS,
    abi: COVERED_CALL_ABI,
    functionName: "isInTheMoney",
    args: [optionId],
    query: { refetchInterval: 10000 },
  });

  if (!option) return null;

  const opt = option as {
    writer: string;
    buyer: string;
    stockToken: string;
    ticker: string;
    amount: bigint;
    strikePrice: bigint;
    premium: bigint;
    expiry: bigint;
    priceOracle: string;
    status: number;
    createdAt: bigint;
    exercisedAt: bigint;
  };

  const statusName = STATUS_NAMES[opt.status] ?? "UNKNOWN";
  const isWriter = opt.writer.toLowerCase() === userAddress.toLowerCase();
  const timeLeft = tte ? formatTimeRemaining(Number(tte)) : "...";

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-white">{opt.ticker}</span>
          <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${STATUS_COLORS[statusName] || "text-gray-400"}`}>
            {statusName}
          </span>
          {itm && <span className="px-2 py-0.5 rounded-md text-xs font-semibold border text-green-400 bg-green-400/10 border-green-400/30">ITM</span>}
        </div>
        <span className="text-xs text-zinc-500">{isWriter ? "Writer" : "Buyer"}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <p className="text-xs text-zinc-500">Amount</p>
          <p className="text-white font-mono">{formatUnits(opt.amount, 18)} {opt.ticker}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Strike Price</p>
          <p className="text-white font-mono">${formatPrice8(opt.strikePrice)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Premium</p>
          <p className="text-amber-400 font-mono">${(Number(opt.premium) / 1e6).toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Time Left</p>
          <p className="text-white font-mono">{timeLeft}</p>
        </div>
      </div>

      <p className="mt-2 text-xs text-zinc-600 font-mono truncate">ID: {optionId}</p>
    </div>
  );
}
