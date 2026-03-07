"use client";

import { useState } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { type Address } from "viem";
import { Button } from "@/components/ui/button";
import {
  BASKET_FACTORY_ADDRESS,
  STOCK_TOKENS,
  SUPPORTED_STOCKS,
} from "@/config/contracts";
import { BASKET_FACTORY_ABI, BASKET_TOKEN_ABI, ERC20_ABI } from "@/config/abi";

// Stock weight slider row
function StockWeightRow({
  ticker,
  weight,
  onChange,
}: {
  ticker: string;
  weight: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-12 text-sm font-mono text-zinc-300">{ticker}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={weight}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-emerald-500"
      />
      <span className="w-10 text-right text-sm text-emerald-400 font-semibold">{weight}%</span>
    </div>
  );
}

// Full basket card with mint/burn
function BasketCard({ basketId }: { basketId: number }) {
  const { address } = useAccount();
  const [tab, setTab] = useState<"info" | "mint" | "burn">("info");
  const [mintAmount, setMintAmount] = useState("");
  const [burnAmount, setBurnAmount] = useState("");
  const [txMsg, setTxMsg] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const { writeContractAsync } = useWriteContract();

  // ── All hooks must be unconditional ──────────────────────────────────
  const { data: basketInfo } = useReadContract({
    address: BASKET_FACTORY_ADDRESS,
    abi: BASKET_FACTORY_ABI,
    functionName: "baskets",
    args: [BigInt(basketId)],
    query: { enabled: !!BASKET_FACTORY_ADDRESS },
  });

  const basketToken = basketInfo
    ? (basketInfo as [Address, Address, string, string, bigint])[0]
    : undefined;

  const { data: basketPrice } = useReadContract({
    address: BASKET_FACTORY_ADDRESS,
    abi: BASKET_FACTORY_ABI,
    functionName: "getBasketPrice",
    args: basketToken ? [basketToken] : undefined,
    query: { enabled: !!basketToken, retry: false, refetchInterval: 10_000 },
  });

  const { data: totalSupply, refetch: refetchSupply } = useReadContract({
    address: basketToken,
    abi: BASKET_TOKEN_ABI,
    functionName: "totalSupply",
    query: { enabled: !!basketToken, retry: false, refetchInterval: 10_000 },
  });

  const { data: composition } = useReadContract({
    address: basketToken,
    abi: BASKET_TOKEN_ABI,
    functionName: "composition",
    query: { enabled: !!basketToken, retry: false, refetchInterval: 30_000 },
  });

  const { data: myBalance, refetch: refetchBalance } = useReadContract({
    address: basketToken,
    abi: BASKET_TOKEN_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!basketToken && !!address, retry: false, refetchInterval: 5_000 },
  });

  // Read user's stock token balances for mint/burn info
  const stockEntries = Object.entries(STOCK_TOKENS);
  const { data: stockBalances } = useReadContracts({
    contracts: stockEntries.map(([, addr]) => ({
      address: addr as Address,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: address ? [address] : undefined,
    })),
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  const mintAmountWei = mintAmount && parseFloat(mintAmount) > 0
    ? parseUnits(mintAmount, 18)
    : undefined;

  const { data: quoteMintData } = useReadContract({
    address: BASKET_FACTORY_ADDRESS,
    abi: BASKET_FACTORY_ABI,
    functionName: "quoteMint",
    args: basketToken && mintAmountWei ? [basketToken, mintAmountWei] : undefined,
    query: { enabled: !!basketToken && !!mintAmountWei, retry: false },
  });

  // ── Early return after all hooks ──────────────────────────────────
  if (!basketInfo) return null;

  const [, , bName, symbol] = basketInfo as [Address, Address, string, string, bigint];

  const TICKER_BY_ADDR: Record<string, string> = {};
  for (const [t, a] of Object.entries(STOCK_TOKENS)) TICKER_BY_ADDR[a.toLowerCase()] = t;

  let compTokens: string[] = [];
  let compWeights: bigint[] = [];
  try {
    if (composition) {
      const comp = composition as [string[], bigint[]];
      compTokens = comp[0] || [];
      compWeights = comp[1] || [];
    }
  } catch { /* ignore decode errors */ }

  const myBalanceNum = myBalance ? Number(formatUnits(myBalance as bigint, 18)) : 0;

  // ── Mint handler ──────────────────────────────────────────────────
  async function handleMint() {
    if (!address || !basketToken || !mintAmountWei || !quoteMintData) return;
    setWorking(true);
    setTxMsg("Approving stock tokens...");
    try {
      const [tokens, amounts] = quoteMintData as [Address[], bigint[]];
      // Approve each underlying token
      for (let i = 0; i < tokens.length; i++) {
        if (amounts[i] === 0n) continue;
        await writeContractAsync({
          address: tokens[i],
          abi: ERC20_ABI,
          functionName: "approve",
          args: [BASKET_FACTORY_ADDRESS, amounts[i]],
        });
      }
      setTxMsg("Minting basket tokens...");
      const hash = await writeContractAsync({
        address: BASKET_FACTORY_ADDRESS,
        abi: BASKET_FACTORY_ABI,
        functionName: "mint",
        args: [basketToken, mintAmountWei],
      });
      setTxMsg(`Minted! Tx: ${hash.slice(0, 10)}...${hash.slice(-6)}`);
      setMintAmount("");
      // Refetch balances after mint
      setTimeout(() => { refetchBalance(); refetchSupply(); }, 2000);
    } catch (e) {
      console.error(e);
      setTxMsg("Transaction failed. Check console.");
    } finally {
      setWorking(false);
    }
  }

  // ── Burn handler ──────────────────────────────────────────────────
  async function handleBurn() {
    if (!address || !basketToken || !burnAmount || parseFloat(burnAmount) <= 0) return;
    const burnWei = parseUnits(burnAmount, 18);
    setWorking(true);
    setTxMsg("Approving basket token...");
    try {
      await writeContractAsync({
        address: basketToken,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [BASKET_FACTORY_ADDRESS, burnWei],
      });
      setTxMsg("Burning basket tokens...");
      const hash = await writeContractAsync({
        address: BASKET_FACTORY_ADDRESS,
        abi: BASKET_FACTORY_ABI,
        functionName: "burn",
        args: [basketToken, burnWei],
      });
      setTxMsg(`Redeemed! Tx: ${hash.slice(0, 10)}...${hash.slice(-6)}`);
      setBurnAmount("");
      // Refetch balances after burn
      setTimeout(() => { refetchBalance(); refetchSupply(); }, 2000);
    } catch (e) {
      console.error(e);
      setTxMsg("Transaction failed. Check console.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-4 pb-2">
        <div>
          <span className="text-sm font-bold text-white">{bName}</span>
          <span className="ml-2 text-xs text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded">
            {symbol}
          </span>
        </div>
        {basketPrice && (
          <div className="text-right">
            <div className="text-lg font-bold text-emerald-400">
              ${(Number(basketPrice as bigint) / 1e8).toFixed(2)}
            </div>
            <div className="text-[10px] text-zinc-600">weighted price</div>
          </div>
        )}
      </div>

      {/* Composition pills */}
      {compTokens.length > 0 && (
        <div className="flex gap-1.5 flex-wrap px-4 pb-2">
          {compTokens.map((t, i) => {
            const ticker = TICKER_BY_ADDR[t.toLowerCase()] || t.slice(0, 6);
            const pct = compWeights[i] ? Number(compWeights[i]) / 100 : 0;
            return (
              <span key={i} className="text-[11px] bg-white/5 border border-white/10 rounded px-2 py-0.5 text-zinc-300">
                {pct}% {ticker}
              </span>
            );
          })}
        </div>
      )}

      {/* Stats row */}
      <div className="flex justify-between text-xs text-zinc-600 px-4 pb-3">
        <span className="font-mono">{basketToken!.slice(0, 10)}...{basketToken!.slice(-6)}</span>
        <div className="flex gap-4">
          <span>Supply: {totalSupply ? (Number(totalSupply as bigint) / 1e18).toFixed(2) : "0"}</span>
          {address && (
            <span className={myBalanceNum > 0 ? "text-emerald-500" : "text-zinc-600"}>
              You: {myBalanceNum.toFixed(4)}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-t border-white/5">
        {(["info", "mint", "burn"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setTxMsg(null); }}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === t
                ? "bg-white/[0.04] text-white border-b border-emerald-500"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t === "info" ? "Info" : t === "mint" ? "Mint" : "Burn"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4 min-h-[80px]">
        {tab === "info" && (
          <div className="text-xs text-zinc-500 space-y-1">
            <div className="flex justify-between">
              <span>1 {symbol} token =</span>
              <span className="text-zinc-300">proportional stock holdings</span>
            </div>
            <div className="flex justify-between">
              <span>Mint by depositing</span>
              <span className="text-zinc-300">underlying stock tokens</span>
            </div>
            <div className="flex justify-between">
              <span>Burn to redeem</span>
              <span className="text-zinc-300">underlying stocks pro-rata</span>
            </div>
          </div>
        )}

        {tab === "mint" && (
          <div className="space-y-3">
            {/* User's stock token balances */}
            {address && stockBalances && (
              <div className="rounded-lg bg-white/[0.03] p-2.5 text-xs space-y-1">
                <div className="text-zinc-500 mb-1">Your wallet balances:</div>
                {stockEntries.map(([ticker], i) => {
                  const bal = stockBalances[i]?.result as bigint | undefined;
                  const balNum = bal ? Number(formatUnits(bal, 18)) : 0;
                  const inBasket = compTokens.some(
                    (t) => TICKER_BY_ADDR[t.toLowerCase()] === ticker
                  );
                  if (!inBasket) return null;
                  return (
                    <div key={ticker} className="flex justify-between text-zinc-300">
                      <span>{ticker}</span>
                      <span className={`font-mono ${balNum > 0 ? "text-emerald-400" : "text-zinc-600"}`}>
                        {balNum.toFixed(4)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Basket tokens to mint</label>
              <input
                type="number"
                value={mintAmount}
                onChange={(e) => { setMintAmount(e.target.value); setTxMsg(null); }}
                placeholder="e.g. 1"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-emerald-500/50 focus:outline-none"
              />
            </div>

            {/* Quote preview */}
            {quoteMintData && (
              <div className="rounded-lg bg-white/[0.03] p-2.5 text-xs space-y-1">
                <div className="text-zinc-500 mb-1">Required deposits:</div>
                {(quoteMintData as [Address[], bigint[]])[0].map((tok, i) => {
                  const ticker = TICKER_BY_ADDR[tok.toLowerCase()] || tok.slice(0, 6);
                  const amt = (quoteMintData as [Address[], bigint[]])[1][i];
                  return (
                    <div key={i} className="flex justify-between text-zinc-300">
                      <span>{ticker}</span>
                      <span className="font-mono">{Number(formatUnits(amt, 18)).toFixed(4)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {txMsg && (
              <div className={`text-xs rounded px-2 py-1.5 ${txMsg.includes("failed") ? "text-red-400 bg-red-500/10" : "text-emerald-400 bg-emerald-500/10"}`}>
                {txMsg}
              </div>
            )}

            <Button
              onClick={handleMint}
              disabled={!address || !mintAmount || parseFloat(mintAmount) <= 0 || working}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white border-0 text-xs py-2 h-auto"
            >
              {working ? txMsg || "Working..." : address ? `Mint ${symbol}` : "Connect Wallet"}
            </Button>
          </div>
        )}

        {tab === "burn" && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Basket tokens to burn
                {myBalanceNum > 0 && (
                  <button
                    onClick={() => setBurnAmount(myBalanceNum.toString())}
                    className="ml-2 text-emerald-400 hover:underline"
                  >
                    Max: {myBalanceNum.toFixed(4)}
                  </button>
                )}
              </label>
              <input
                type="number"
                value={burnAmount}
                onChange={(e) => { setBurnAmount(e.target.value); setTxMsg(null); }}
                placeholder="e.g. 1"
                max={myBalanceNum}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-emerald-500/50 focus:outline-none"
              />
            </div>

            {txMsg && (
              <div className={`text-xs rounded px-2 py-1.5 ${txMsg.includes("failed") ? "text-red-400 bg-red-500/10" : "text-emerald-400 bg-emerald-500/10"}`}>
                {txMsg}
              </div>
            )}

            <Button
              onClick={handleBurn}
              disabled={!address || !burnAmount || parseFloat(burnAmount) <= 0 || working || parseFloat(burnAmount) > myBalanceNum}
              className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10 text-xs py-2 h-auto"
            >
              {working ? txMsg || "Working..." : address ? `Redeem ${symbol}` : "Connect Wallet"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BasketPage() {
  const { address } = useAccount();

  // ── Create form state ─────────────────────────────────────────────
  const [basketName, setBasketName] = useState("");
  const [basketSymbol, setBasketSymbol] = useState("");
  const [weights, setWeights] = useState<Record<string, number>>({
    TSLA: 40, AMZN: 30, PLTR: 20, NFLX: 5, AMD: 5,
  });
  const [creating, setCreating] = useState(false);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const isValidWeights = totalWeight === 100;

  // ── Basket count ──────────────────────────────────────────────────
  const { data: basketCount } = useReadContract({
    address: BASKET_FACTORY_ADDRESS,
    abi: BASKET_FACTORY_ABI,
    functionName: "basketCount",
    query: { enabled: !!BASKET_FACTORY_ADDRESS, refetchInterval: 15_000 },
  });

  const { writeContractAsync } = useWriteContract();

  // ── Create basket ─────────────────────────────────────────────────
  async function handleCreate() {
    if (!address || !isValidWeights || !basketName || !basketSymbol) return;
    setCreating(true);
    setCreateSuccess(null);
    try {
      const activeStocks = SUPPORTED_STOCKS.filter((s) => weights[s.ticker] > 0);
      const tokens = activeStocks.map((s) => STOCK_TOKENS[s.ticker]);
      const bps = activeStocks.map((s) => BigInt(weights[s.ticker] * 100)); // pct -> bps

      const hash = await writeContractAsync({
        address: BASKET_FACTORY_ADDRESS,
        abi: BASKET_FACTORY_ABI,
        functionName: "createBasket",
        args: [basketName, basketSymbol.toUpperCase(), tokens, bps],
      });
      setCreateSuccess(hash);
      setBasketName("");
      setBasketSymbol("");
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  }

  function handleWeightChange(ticker: string, val: number) {
    setWeights((prev) => ({ ...prev, [ticker]: val }));
  }

  const count = basketCount ? Number(basketCount as bigint) : 0;

  return (
    <div className="min-h-screen py-12">
      <div className="mx-auto max-w-5xl px-4">

        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 mb-4">
            <span className="text-emerald-400 text-xs font-semibold uppercase tracking-wide">
              New primitive
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Basket Factory
          </h1>
          <p className="text-zinc-400 max-w-2xl">
            Create your own stock index in one transaction. No SEC approval. No $250K minimum.
            Permissionless on-chain ETFs, native to Robinhood Chain.
          </p>
          <div className="mt-3 flex gap-6 text-sm text-zinc-500">
            <span>
              <span className="text-white font-semibold">{count}</span> baskets created
            </span>
            <span>
              <span className="text-white font-semibold">5</span> stocks supported
            </span>
            <span>
              <span className="text-emerald-400 font-semibold">Free</span> to create
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Create Basket Form */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <h2 className="text-lg font-semibold text-white mb-1">Create New Basket</h2>
            <p className="text-xs text-zinc-500 mb-5">
              Pick your stock weights. 1 basket token = proportional holdings.
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Basket Name</label>
                  <input
                    type="text"
                    value={basketName}
                    onChange={(e) => setBasketName(e.target.value)}
                    placeholder="e.g. Kamal Tech Basket"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Ticker Symbol</label>
                  <input
                    type="text"
                    value={basketSymbol}
                    onChange={(e) => setBasketSymbol(e.target.value.toUpperCase())}
                    placeholder="e.g. KTECH"
                    maxLength={8}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-emerald-500/50 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="space-y-3 py-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-zinc-400">Stock Weights</span>
                  <span className={`text-xs font-semibold ${isValidWeights ? "text-emerald-400" : "text-yellow-400"}`}>
                    {totalWeight}% {isValidWeights ? "✓" : `(need ${100 - totalWeight > 0 ? "+" : ""}${100 - totalWeight}%)`}
                  </span>
                </div>
                {SUPPORTED_STOCKS.map((s) => (
                  <StockWeightRow
                    key={s.ticker}
                    ticker={s.ticker}
                    weight={weights[s.ticker]}
                    onChange={(v) => handleWeightChange(s.ticker, v)}
                  />
                ))}
              </div>

              {/* Composition preview */}
              {isValidWeights && (
                <div className="rounded-lg bg-white/[0.03] p-3 text-xs">
                  <div className="text-zinc-400 mb-2">Composition</div>
                  <div className="flex flex-wrap gap-2">
                    {SUPPORTED_STOCKS.filter((s) => weights[s.ticker] > 0).map((s) => (
                      <span
                        key={s.ticker}
                        className="rounded px-2 py-0.5 bg-white/5 text-zinc-300"
                      >
                        {weights[s.ticker]}% {s.ticker}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {createSuccess && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400">
                  Basket created! Tx: {createSuccess.slice(0, 10)}...{createSuccess.slice(-8)}
                </div>
              )}

              <Button
                onClick={handleCreate}
                disabled={!address || !isValidWeights || !basketName || !basketSymbol || creating}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white border-0"
              >
                {creating
                  ? "Creating..."
                  : address
                  ? isValidWeights
                    ? "Create Basket Token"
                    : "Adjust weights to 100%"
                  : "Connect Wallet"}
              </Button>
            </div>
          </div>

          {/* Existing Baskets + How it works */}
          <div className="space-y-6">
            {/* Existing baskets */}
            <div>
              <h2 className="text-lg font-semibold text-white mb-3">
                Baskets on RH Chain
              </h2>
              {count === 0 ? (
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 text-center text-zinc-500 text-sm">
                  No baskets created yet. Be the first.
                </div>
              ) : (
                <div className="space-y-3">
                  {Array.from({ length: count }).map((_, i) => (
                    <BasketCard key={i} basketId={i} />
                  ))}
                </div>
              )}
            </div>

            {/* How it works */}
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
              <h3 className="text-sm font-semibold text-white mb-3">How Baskets Work</h3>
              <div className="space-y-3 text-xs text-zinc-400">
                <div className="flex gap-2">
                  <span className="text-emerald-400 font-bold shrink-0">1</span>
                  <span><strong className="text-white">Create</strong> — Deploy a BasketToken ERC-20 with your chosen stock weights. Free. Permissionless.</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-emerald-400 font-bold shrink-0">2</span>
                  <span><strong className="text-white">Mint</strong> — Deposit the proportional stock tokens. Receive basket tokens representing your index.</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-emerald-400 font-bold shrink-0">3</span>
                  <span><strong className="text-white">Protect</strong> — Use your basket token in the Stop-Loss Vault to insure your entire index at once.</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-emerald-400 font-bold shrink-0">4</span>
                  <span><strong className="text-white">Redeem</strong> — Burn basket tokens to receive your underlying stock tokens back pro-rata.</span>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-white/5 text-xs text-zinc-600">
                In TradFi, creating an ETF requires $250K+ in legal fees and SEC approval.
                On StockForge: one transaction.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
