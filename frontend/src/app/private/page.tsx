"use client";

import { useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from "wagmi";
import { parseEther, keccak256, encodePacked, parseEventLogs } from "viem";
import { Button } from "@/components/ui/button";
import {
  PRIVATE_STOP_LOSS_ADDRESS,
  ORACLES,
  STOCK_TOKENS,
  USDC_ADDRESS,
  SUPPORTED_STOCKS,
  RH_CHAIN_EXPLORER,
} from "@/config/contracts";
import { PRIVATE_STOP_LOSS_ABI, ERC20_ABI, PRICE_ORACLE_ABI } from "@/config/abi";
import type { Address } from "viem";

const BOT_URL = process.env.NEXT_PUBLIC_BOT_URL || "http://localhost:3001";

export default function PrivateStopLossPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [step, setStep] = useState<"configure" | "committed" | "revealed">("configure");
  const [selectedTicker, setSelectedTicker] = useState("TSLA");
  const [amount, setAmount] = useState("1");
  const [stopPrice, setStopPrice] = useState("");
  const [salt, setSalt] = useState("");
  const [positionId, setPositionId] = useState<string | null>(null);
  const [keeperRegistered, setKeeperRegistered] = useState(false);
  const [commitTxHash, setCommitTxHash] = useState<`0x${string}` | undefined>();
  const [isCommitting, setIsCommitting] = useState(false);

  const { writeContractAsync, data: txHash } = useWriteContract();
  const { isLoading: txPending } = useWaitForTransactionReceipt({ hash: txHash });

  const stockToken = STOCK_TOKENS[selectedTicker] as Address;
  const oracle = ORACLES[selectedTicker] as Address;

  const { data: currentPrice } = useReadContract({
    address: oracle,
    abi: PRICE_ORACLE_ABI,
    functionName: "latestPrice",
    query: { refetchInterval: 10_000 },
  });

  const { data: privateStats } = useReadContract({
    address: PRIVATE_STOP_LOSS_ADDRESS,
    abi: PRIVATE_STOP_LOSS_ABI,
    functionName: "getStats",
    query: { refetchInterval: 15_000 },
  });

  const priceNum = currentPrice ? Number(currentPrice as bigint) / 1e8 : 0;
  const privCommitted = privateStats ? Number((privateStats as [bigint, bigint, bigint])[0]) : 0;

  const generateSalt = () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const hex = "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    setSalt(hex);
    return hex;
  };

  const handleCommit = async () => {
    if (!isConnected || !address || !publicClient) return;
    setIsCommitting(true);

    try {
      const stopPriceUsd8 = BigInt(Math.round(parseFloat(stopPrice) * 1e8));
      const currentSalt = salt || generateSalt();
      const saltBytes = currentSalt as `0x${string}`;

      const commitHash = keccak256(encodePacked(["uint256", "bytes32"], [stopPriceUsd8, saltBytes]));
      const amountWei = parseEther(amount);

      // Approve stock token
      await writeContractAsync({
        address: stockToken,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [PRIVATE_STOP_LOSS_ADDRESS, amountWei],
      });

      // Approve USDC for premium
      const premium = BigInt(Math.round(parseFloat(amount) * priceNum * 0.02 * 1e6));
      await writeContractAsync({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [PRIVATE_STOP_LOSS_ADDRESS, premium + BigInt(1e6)],
      });

      // Commit
      const commitTx = await writeContractAsync({
        address: PRIVATE_STOP_LOSS_ADDRESS,
        abi: PRIVATE_STOP_LOSS_ABI,
        functionName: "commitStopLoss",
        args: [stockToken, selectedTicker, amountWei, commitHash, oracle],
      });

      setCommitTxHash(commitTx);

      // Wait for receipt and extract positionId from StopCommitted event
      const receipt = await publicClient.waitForTransactionReceipt({ hash: commitTx });
      const logs = parseEventLogs({
        abi: PRIVATE_STOP_LOSS_ABI,
        eventName: "StopCommitted",
        logs: receipt.logs,
      });

      const actualPositionId = (logs[0]?.args as { positionId?: string })?.positionId ?? commitTx;
      setPositionId(actualPositionId);

      // Register salt with bot keeper (so it can auto-reveal + execute)
      try {
        const resp = await fetch(`${BOT_URL}/register-commit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            positionId: actualPositionId,
            stopPrice: stopPriceUsd8.toString(),
            salt: currentSalt,
            oracle,
          }),
        });
        if (resp.ok) {
          setKeeperRegistered(true);
        }
      } catch {
        // Bot not running — user must reveal manually
        setKeeperRegistered(false);
      }

      setStep("committed");
    } finally {
      setIsCommitting(false);
    }
  };

  const handleReveal = async () => {
    if (!positionId || !salt) return;

    const stopPriceUsd8 = BigInt(Math.round(parseFloat(stopPrice) * 1e8));

    await writeContractAsync({
      address: PRIVATE_STOP_LOSS_ADDRESS,
      abi: PRIVATE_STOP_LOSS_ABI,
      functionName: "revealStopLoss",
      args: [positionId as `0x${string}`, stopPriceUsd8, salt as `0x${string}`],
    });

    setStep("revealed");
  };

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1.5 text-sm text-violet-400 mb-4">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Privacy-Preserving
          </div>
          <h1 className="text-3xl font-bold">Private Stop-Loss</h1>
          <p className="text-zinc-400 mt-2">
            Hide your stop price on-chain using commit-reveal. Front-runners and MEV bots
            cannot see where your stop is set until you choose to reveal it.
          </p>
        </div>

        {/* How it works */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-semibold">How Keeper Mode Works</h2>
            <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2 py-0.5">FHE-equivalent UX</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className={`rounded-xl p-3 border ${step === "configure" ? "border-violet-500/50 bg-violet-500/10" : "border-white/5"}`}>
              <div className="text-2xl font-bold text-violet-400 mb-1">1</div>
              <div className="text-sm font-semibold">Commit</div>
              <div className="text-xs text-zinc-500 mt-1">Hash of stop price posted on-chain. Stop is invisible.</div>
            </div>
            <div className={`rounded-xl p-3 border ${step === "committed" && keeperRegistered ? "border-emerald-500/50 bg-emerald-500/10" : step === "committed" ? "border-violet-500/50 bg-violet-500/10" : "border-white/5"}`}>
              <div className="text-2xl font-bold text-emerald-400 mb-1">2</div>
              <div className="text-sm font-semibold">Keeper Watches</div>
              <div className="text-xs text-zinc-500 mt-1">Bot holds your salt off-chain. Monitors oracle every 30s.</div>
            </div>
            <div className={`rounded-xl p-3 border ${step === "revealed" ? "border-emerald-500/50 bg-emerald-500/10" : "border-white/5"}`}>
              <div className="text-2xl font-bold text-emerald-400 mb-1">3</div>
              <div className="text-sm font-semibold">Auto-Execute</div>
              <div className="text-xs text-zinc-500 mt-1">Bot reveals + executes atomically when price drops. You never log back in.</div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
            <div className="text-xl font-bold text-violet-400">{privCommitted}</div>
            <div className="text-xs text-zinc-500">Committed</div>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
            <div className="text-xl font-bold text-violet-400">{privateStats ? Number((privateStats as [bigint, bigint, bigint])[1]) : 0}</div>
            <div className="text-xs text-zinc-500">Revealed</div>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
            <div className="text-xl font-bold text-emerald-400">{privateStats ? Number((privateStats as [bigint, bigint, bigint])[2]) : 0}</div>
            <div className="text-xs text-zinc-500">Executed</div>
          </div>
        </div>

        {/* Action Card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          {step === "configure" && (
            <>
              <h2 className="text-lg font-semibold mb-4">Create Private Stop-Loss</h2>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">Stock Token</label>
                  <div className="flex gap-2">
                    {SUPPORTED_STOCKS.map((s) => (
                      <button
                        key={s.ticker}
                        onClick={() => setSelectedTicker(s.ticker)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          selectedTicker === s.ticker
                            ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                            : "bg-white/5 text-zinc-400 border border-white/5 hover:bg-white/10"
                        }`}
                      >
                        {s.ticker}
                      </button>
                    ))}
                  </div>
                  {priceNum > 0 && (
                    <p className="text-xs text-zinc-500 mt-1">Current price: ${priceNum.toFixed(2)}</p>
                  )}
                </div>

                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">Amount (tokens)</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white"
                    placeholder="1.0"
                  />
                </div>

                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">
                    Stop Price (USD) <span className="text-violet-400">(will be hidden on-chain)</span>
                  </label>
                  <input
                    type="number"
                    value={stopPrice}
                    onChange={(e) => setStopPrice(e.target.value)}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white"
                    placeholder={priceNum > 0 ? `e.g. ${(priceNum * 0.9).toFixed(2)}` : "e.g. 250.00"}
                  />
                </div>

                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">Salt (secret key)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={salt}
                      onChange={(e) => setSalt(e.target.value)}
                      className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white font-mono text-xs"
                      placeholder="Click Generate or enter your own"
                    />
                    <Button
                      onClick={generateSalt}
                      variant="outline"
                      className="border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
                    >
                      Generate
                    </Button>
                  </div>
                  <p className="text-xs text-red-400 mt-1">
                    Save this salt! You need it to reveal your stop price later.
                  </p>
                </div>

                {stopPrice && amount && priceNum > 0 && (
                  <div className="rounded-lg bg-violet-500/5 border border-violet-500/20 p-3 text-sm">
                    <div className="flex justify-between text-zinc-400">
                      <span>Premium (2%)</span>
                      <span className="text-white">${(parseFloat(amount) * priceNum * 0.02).toFixed(2)} USDC</span>
                    </div>
                    <div className="flex justify-between text-zinc-400 mt-1">
                      <span>Protected Value</span>
                      <span className="text-white">${(parseFloat(amount) * parseFloat(stopPrice)).toFixed(2)}</span>
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleCommit}
                  disabled={!isConnected || !stopPrice || !amount || txPending || isCommitting}
                  className="w-full bg-violet-500 hover:bg-violet-600 text-white border-0"
                >
                  {isCommitting ? "Committing..." : "Commit Hidden Stop-Loss"}
                </Button>
              </div>
            </>
          )}

          {step === "committed" && (
            <>
              <div className="text-center mb-6">
                <div className={`inline-flex items-center justify-center h-12 w-12 rounded-full mb-3 ${keeperRegistered ? "bg-emerald-500/20" : "bg-violet-500/20"}`}>
                  {keeperRegistered ? (
                    <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  ) : (
                    <svg className="h-6 w-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )}
                </div>
                <h2 className="text-lg font-semibold">
                  {keeperRegistered ? "Keeper Bot Armed" : "Stop Price is Hidden"}
                </h2>
                <p className="text-sm text-zinc-400 mt-1">
                  {keeperRegistered
                    ? "Your stop price is registered with the keeper bot. It will auto-reveal and execute the moment price drops — you never need to come back."
                    : "Your stop-loss is committed. Nobody can see your stop price on-chain."}
                </p>
              </div>

              {commitTxHash && (
                <a
                  href={`${RH_CHAIN_EXPLORER}/tx/${commitTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs font-mono text-zinc-500 hover:text-zinc-300 text-center mb-4 break-all"
                >
                  View tx: {commitTxHash.slice(0, 20)}...
                </a>
              )}

              {keeperRegistered ? (
                <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3 text-sm text-emerald-300 mb-4">
                  <div className="font-semibold mb-1">Bot keeper active</div>
                  The keeper bot holds your salt off-chain (encrypted). When {selectedTicker} drops to ${stopPrice},
                  it calls <code className="bg-emerald-500/10 px-1 rounded">revealAndExecute</code> atomically.
                  Your stop price is NEVER visible on-chain until the moment of execution.
                </div>
              ) : (
                <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 text-sm text-amber-300 mb-4">
                  Bot keeper not detected (is the bot running?). You can still arm manually — reveal your stop price below.
                  You have 7 days.
                </div>
              )}

              {!keeperRegistered && (
                <Button
                  onClick={handleReveal}
                  disabled={txPending}
                  className="w-full bg-violet-500 hover:bg-violet-600 text-white border-0"
                >
                  {txPending ? "Revealing..." : "Reveal Stop Price & Arm Manually"}
                </Button>
              )}

              {keeperRegistered && (
                <Button
                  onClick={() => { setStep("configure"); setPositionId(null); setSalt(""); setStopPrice(""); setKeeperRegistered(false); }}
                  variant="outline"
                  className="w-full border-white/10 text-zinc-300"
                >
                  Create Another
                </Button>
              )}
            </>
          )}

          {step === "revealed" && (
            <div className="text-center">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-emerald-500/20 mb-3">
                <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold">Stop-Loss Armed</h2>
              <p className="text-sm text-zinc-400 mt-1 mb-4">
                Your stop at ${stopPrice} is now active. The bot will execute automatically
                when {selectedTicker} drops to your stop price.
              </p>
              <Button
                onClick={() => { setStep("configure"); setPositionId(null); setSalt(""); setStopPrice(""); }}
                variant="outline"
                className="border-white/10 text-zinc-300"
              >
                Create Another
              </Button>
            </div>
          )}
        </div>

        {!isConnected && (
          <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-center">
            <p className="text-sm text-amber-300">Connect your wallet to create a private stop-loss</p>
          </div>
        )}
      </div>
    </div>
  );
}
