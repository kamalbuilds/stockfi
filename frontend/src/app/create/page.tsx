"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { Button } from "@/components/ui/button";
import { VAULT_ADDRESS, ORACLES, STOCK_TOKENS, USDC_ADDRESS, SUPPORTED_STOCKS } from "@/config/contracts";
import { STOP_LOSS_VAULT_ABI, PRICE_ORACLE_ABI, ERC20_ABI } from "@/config/abi";

function formatPrice8(price: bigint): string {
  return (Number(price) / 1e8).toFixed(2);
}

export default function CreatePage() {
  const { address } = useAccount();
  const [ticker, setTicker] = useState("TSLA");
  const [amount, setAmount] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [txStep, setTxStep] = useState<"idle" | "approve-token" | "approve-usdc" | "create" | "done">("idle");

  const oracleAddress = ORACLES[ticker];
  const stockTokenAddress = STOCK_TOKENS[ticker];

  const { data: currentPriceRaw } = useReadContract({
    address: oracleAddress,
    abi: PRICE_ORACLE_ABI,
    functionName: "latestPrice",
    query: { enabled: !!oracleAddress },
  });

  const currentPrice = currentPriceRaw ? formatPrice8(currentPriceRaw as bigint) : null;

  // Calculate premium preview (2% of position value)
  const premiumPreview = (() => {
    if (!amount || !stopPrice || !currentPriceRaw) return null;
    const amountFloat = parseFloat(amount);
    const stopFloat = parseFloat(stopPrice);
    const currFloat = Number(currentPriceRaw as bigint) / 1e8;
    if (isNaN(amountFloat) || isNaN(stopFloat) || stopFloat >= currFloat) return null;
    const positionValue = amountFloat * currFloat; // in USD
    const premium = positionValue * 0.02;
    return premium.toFixed(2);
  })();

  const { writeContractAsync } = useWriteContract();
  const [pendingTxHash, setPendingTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: waitingForTx } = useWaitForTransactionReceipt({ hash: pendingTxHash });

  async function handleCreate() {
    if (!address || !VAULT_ADDRESS || !oracleAddress || !stockTokenAddress) return;
    if (!amount || !stopPrice) return;

    const amountWei = parseUnits(amount, 18);
    const stopPriceRaw = BigInt(Math.round(parseFloat(stopPrice) * 1e8));

    setTxStep("approve-token");
    try {
      // 1. Approve stock token
      const approveTx = await writeContractAsync({
        address: stockTokenAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [VAULT_ADDRESS, amountWei],
      });
      setPendingTxHash(approveTx);
      // Wait handled by useWaitForTransactionReceipt in real app

      setTxStep("approve-usdc");
      // 2. Approve USDC for premium (estimate: 2% of position)
      const usdcAmount = parseUnits("1000", 6); // Approve large allowance
      const approveUsdcTx = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [VAULT_ADDRESS, usdcAmount],
      });
      setPendingTxHash(approveUsdcTx);

      setTxStep("create");
      // 3. Create stop-loss
      const createTx = await writeContractAsync({
        address: VAULT_ADDRESS,
        abi: STOP_LOSS_VAULT_ABI,
        functionName: "createStopLoss",
        args: [stockTokenAddress, ticker, amountWei, stopPriceRaw, oracleAddress],
      });
      setPendingTxHash(createTx);
      setTxStep("done");
    } catch (err) {
      console.error("Create stop-loss failed:", err);
      setTxStep("idle");
    }
  }

  const isValid = (() => {
    if (!amount || !stopPrice || !currentPriceRaw) return false;
    const stopFloat = parseFloat(stopPrice);
    const currFloat = Number(currentPriceRaw as bigint) / 1e8;
    return stopFloat > 0 && stopFloat < currFloat && parseFloat(amount) > 0;
  })();

  return (
    <div className="min-h-screen py-12">
      <div className="mx-auto max-w-2xl px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Create Stop-Loss</h1>
          <p className="text-zinc-400 text-sm">
            Set a guaranteed execution price. Your tokens are protected even if the market gaps below your stop.
          </p>
        </div>

        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 space-y-6">
          {/* Stock Selector */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-3">Stock</label>
            <div className="flex flex-wrap gap-2">
              {SUPPORTED_STOCKS.map((stock) => (
                <button
                  key={stock.ticker}
                  onClick={() => setTicker(stock.ticker)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    ticker === stock.ticker
                      ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-400"
                      : "bg-white/5 border border-white/10 text-zinc-400 hover:border-white/20"
                  }`}
                >
                  {stock.ticker}
                </button>
              ))}
            </div>
            {currentPrice && (
              <p className="mt-2 text-xs text-zinc-500">
                Current price: <span className="text-emerald-400 font-mono">${currentPrice}</span>
              </p>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Amount ({ticker})</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 10"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-zinc-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
            />
          </div>

          {/* Stop Price */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Guaranteed Stop Price (USD)
              {currentPrice && (
                <span className="ml-2 text-zinc-500 font-normal">
                  must be below ${currentPrice}
                </span>
              )}
            </label>
            <input
              type="number"
              value={stopPrice}
              onChange={(e) => setStopPrice(e.target.value)}
              placeholder="e.g. 270"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-zinc-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
            />
          </div>

          {/* Premium preview */}
          {premiumPreview && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Insurance Premium (2%)</span>
                <span className="font-semibold text-emerald-400">${premiumPreview} USDC</span>
              </div>
              <p className="mt-1 text-xs text-zinc-600">
                Paid once at creation. Backs your guaranteed stop at ${stopPrice}.
              </p>
            </div>
          )}

          {/* Tx status */}
          {txStep !== "idle" && txStep !== "done" && (
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-400">
              {txStep === "approve-token" && "Step 1/3: Approving stock token transfer..."}
              {txStep === "approve-usdc" && "Step 2/3: Approving USDC premium..."}
              {txStep === "create" && "Step 3/3: Creating stop-loss position..."}
              {waitingForTx && " (waiting for confirmation)"}
            </div>
          )}

          {txStep === "done" && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-400">
              Stop-loss created! Your {ticker} is now protected at ${stopPrice}. Check your Dashboard.
            </div>
          )}

          {/* Submit */}
          {!address ? (
            <div className="text-center text-zinc-500 text-sm">Connect your wallet to create a stop-loss</div>
          ) : txStep === "done" ? null : (
            <Button
              onClick={handleCreate}
              disabled={!isValid || txStep !== "idle"}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white border-0 py-3"
            >
              {txStep !== "idle" ? "Creating..." : `Protect My ${ticker}`}
            </Button>
          )}
        </div>

        {/* Explainer */}
        <div className="mt-6 rounded-xl border border-white/5 bg-white/[0.02] p-5 text-sm text-zinc-500">
          <p className="font-medium text-zinc-400 mb-2">What happens next?</p>
          <ol className="space-y-1 list-decimal list-inside">
            <li>Your {ticker || "stock"} tokens are held in the StopLossVault</li>
            <li>The price bot monitors your stop price every 30 seconds</li>
            <li>If price drops to your stop, you receive USDC at exactly ${stopPrice || "your stop price"}</li>
            <li>The insurance pool covers any gap between market and stop price</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
