"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { parseUnits } from "viem";
import { Button } from "@/components/ui/button";
import { INSURANCE_POOL_ADDRESS, USDC_ADDRESS } from "@/config/contracts";
import { GAP_INSURANCE_POOL_ABI, ERC20_ABI } from "@/config/abi";

function formatUsdc6(val: bigint): string {
  return (Number(val) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function InsurancePage() {
  const { address } = useAccount();
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawShares, setWithdrawShares] = useState("");
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");

  const { data: stats } = useReadContract({
    address: INSURANCE_POOL_ADDRESS,
    abi: GAP_INSURANCE_POOL_ABI,
    functionName: "getStats",
    query: { enabled: !!INSURANCE_POOL_ADDRESS, refetchInterval: 10_000 },
  });

  const { data: providerVal } = useReadContract({
    address: INSURANCE_POOL_ADDRESS,
    abi: GAP_INSURANCE_POOL_ABI,
    functionName: "providerValue",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!INSURANCE_POOL_ADDRESS },
  });

  const { data: utilizationBps } = useReadContract({
    address: INSURANCE_POOL_ADDRESS,
    abi: GAP_INSURANCE_POOL_ABI,
    functionName: "utilizationBps",
    query: { enabled: !!INSURANCE_POOL_ADDRESS, refetchInterval: 10_000 },
  });

  const { data: providerInfo } = useReadContract({
    address: INSURANCE_POOL_ADDRESS,
    abi: GAP_INSURANCE_POOL_ABI,
    functionName: "providers",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!INSURANCE_POOL_ADDRESS },
  });

  const { writeContractAsync } = useWriteContract();

  const statsData = stats as [bigint, bigint, bigint, bigint, bigint] | undefined;
  const utilPct = utilizationBps ? (Number(utilizationBps as bigint) / 100).toFixed(1) : null;
  const myValue = providerVal ? formatUsdc6(providerVal as bigint) : "0.00";
  const myShares = providerInfo ? (Number((providerInfo as [bigint, bigint, bigint, bigint])[1]) / 1e18).toFixed(4) : "0";

  async function handleDeposit() {
    if (!address || !depositAmount || !INSURANCE_POOL_ADDRESS) return;
    const amount = parseUnits(depositAmount, 6);
    // Approve first
    await writeContractAsync({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [INSURANCE_POOL_ADDRESS, amount],
    });
    await writeContractAsync({
      address: INSURANCE_POOL_ADDRESS,
      abi: GAP_INSURANCE_POOL_ABI,
      functionName: "deposit",
      args: [amount],
    });
    setDepositAmount("");
  }

  async function handleWithdraw() {
    if (!address || !withdrawShares || !INSURANCE_POOL_ADDRESS) return;
    const shares = parseUnits(withdrawShares, 18);
    await writeContractAsync({
      address: INSURANCE_POOL_ADDRESS,
      abi: GAP_INSURANCE_POOL_ABI,
      functionName: "withdraw",
      args: [shares],
    });
    setWithdrawShares("");
  }

  return (
    <div className="min-h-screen py-12">
      <div className="mx-auto max-w-5xl px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Gap Insurance Pool</h1>
          <p className="text-zinc-400 text-sm">
            Provide USDC liquidity to back stop-loss guarantees. Earn 2% premiums from every stop-loss created.
          </p>
        </div>

        {/* Pool Stats */}
        {statsData && (
          <div className="mb-8 grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: "Pool Balance", value: `$${formatUsdc6(statsData[1])}` },
              { label: "Total Deposited", value: `$${formatUsdc6(statsData[0])}` },
              { label: "Premiums Earned", value: `$${formatUsdc6(statsData[2])}` },
              { label: "Gaps Covered", value: `$${formatUsdc6(statsData[3])}` },
              { label: "Providers", value: statsData[4].toString() },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center">
                <div className="text-xl font-bold text-emerald-400">{stat.value}</div>
                <div className="text-xs text-zinc-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Utilization bar */}
        {utilPct && (
          <div className="mb-8 rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-zinc-400">Pool Utilization</span>
              <span className="text-white font-semibold">{utilPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/10">
              <div
                className="h-2 rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(parseFloat(utilPct), 100)}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-xs">
              <span className="text-zinc-600">
                Lower utilization = more capacity to back new stop-losses
              </span>
              <span className={parseFloat(utilPct) >= 80 ? "text-red-400 font-semibold" : "text-zinc-600"}>
                {parseFloat(utilPct) >= 80 ? "Pool at capacity - new stops blocked" : "80% cap enforced on-chain"}
              </span>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* LP Action Form */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <div className="flex gap-2 mb-6">
              {(["deposit", "withdraw"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-white/5 text-zinc-400 border border-white/10 hover:border-white/20"
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {activeTab === "deposit" ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">USDC Amount</label>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="e.g. 1000"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-zinc-600 focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>
                {depositAmount && parseFloat(depositAmount) > 0 && (
                  <div className="text-xs text-zinc-500">
                    You will receive pool shares proportional to your deposit.
                    Annual yield from 2% premiums on stop-loss creation.
                  </div>
                )}
                <Button
                  onClick={handleDeposit}
                  disabled={!address || !depositAmount || !INSURANCE_POOL_ADDRESS}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white border-0"
                >
                  {address ? "Deposit USDC" : "Connect Wallet"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">
                    Shares to Redeem
                    {myShares !== "0" && (
                      <span className="ml-2 text-zinc-600">({myShares} available)</span>
                    )}
                  </label>
                  <input
                    type="number"
                    value={withdrawShares}
                    onChange={(e) => setWithdrawShares(e.target.value)}
                    placeholder="e.g. 100"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-zinc-600 focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>
                <Button
                  onClick={handleWithdraw}
                  disabled={!address || !withdrawShares || !INSURANCE_POOL_ADDRESS}
                  className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10"
                >
                  {address ? "Withdraw USDC" : "Connect Wallet"}
                </Button>
              </div>
            )}
          </div>

          {/* Your Position */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Your Position</h3>
            {!address ? (
              <p className="text-zinc-500 text-sm">Connect wallet to see your LP position</p>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Current Value</span>
                  <span className="text-emerald-400 font-semibold">${myValue} USDC</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Shares Held</span>
                  <span className="text-white">{myShares}</span>
                </div>
                <div className="pt-3 border-t border-white/5 text-xs text-zinc-600 space-y-1">
                  <p>Yield source: 2% premium from every stop-loss created</p>
                  <p>Risk: pool covers gaps when price drops through stop prices</p>
                  <p>Compensation: pool receives the discounted stock tokens</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* How it works */}
        <div className="mt-8 rounded-xl border border-white/5 bg-white/[0.02] p-6">
          <h3 className="text-lg font-semibold text-white mb-4">How LP Yield Works</h3>
          <div className="grid md:grid-cols-3 gap-6 text-sm text-zinc-400">
            <div>
              <div className="text-emerald-400 font-semibold mb-1">Premiums In</div>
              <p>Every stop-loss created pays 2% of position value to the pool. A $50K TSLA position = $1,000 premium.</p>
            </div>
            <div>
              <div className="text-yellow-400 font-semibold mb-1">Gaps Out</div>
              <p>When price gaps below a stop, the pool covers the difference in USDC. Pool receives the discounted stock tokens.</p>
            </div>
            <div>
              <div className="text-blue-400 font-semibold mb-1">Net Return</div>
              <p>LPs profit when premiums collected exceeds gaps covered. Stock tokens received can be sold back at recovery.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
