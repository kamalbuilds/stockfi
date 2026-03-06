"use client";

import { useAccount, useChainId, useSwitchChain, useReadContract } from "wagmi";
import { Button } from "@/components/ui/button";
import {
  FHE_STOP_LOSS_ADDRESS,
  ARB_SEPOLIA_CHAIN_ID,
} from "@/config/contracts";
import { FHE_STOP_LOSS_ABI } from "@/config/abi";

function FHEExplainer() {
  return (
    <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-6">
      <h3 className="text-lg font-bold text-purple-400 mb-4">
        How FHE Privacy Works
      </h3>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-white/5 p-4 border border-white/10">
          <div className="text-2xl mb-2">1</div>
          <h4 className="font-semibold text-white mb-1">Encrypt Client-Side</h4>
          <p className="text-sm text-zinc-400">
            Your stop price is encrypted with FHE before it ever touches the blockchain.
            Not even the contract can see it.
          </p>
        </div>
        <div className="rounded-xl bg-white/5 p-4 border border-white/10">
          <div className="text-2xl mb-2">2</div>
          <h4 className="font-semibold text-white mb-1">Encrypted Comparison</h4>
          <p className="text-sm text-zinc-400">
            The CoFHE coprocessor compares encrypted prices using homomorphic operations.
            <code className="text-purple-400"> FHE.lte(currentPrice, stopPrice)</code> runs on encrypted data.
          </p>
        </div>
        <div className="rounded-xl bg-white/5 p-4 border border-white/10">
          <div className="text-2xl mb-2">3</div>
          <h4 className="font-semibold text-white mb-1">Threshold Decrypt</h4>
          <p className="text-sm text-zinc-400">
            Only the trigger boolean is decrypted via MPC threshold network.
            Your stop price remains encrypted forever.
          </p>
        </div>
      </div>
    </div>
  );
}

function ComparisonTable() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h3 className="text-lg font-bold text-white mb-4">
        Privacy Methods Compared
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-3 px-4 text-zinc-400 font-medium">Feature</th>
              <th className="text-center py-3 px-4 text-zinc-400 font-medium">TradFi Stop-Loss</th>
              <th className="text-center py-3 px-4 text-emerald-400 font-medium">Commit-Reveal (RH Chain)</th>
              <th className="text-center py-3 px-4 text-purple-400 font-medium">FHE (Arb Sepolia)</th>
            </tr>
          </thead>
          <tbody className="text-zinc-300">
            <tr className="border-b border-white/5">
              <td className="py-3 px-4">Stop price visible</td>
              <td className="text-center py-3 px-4 text-red-400">Always</td>
              <td className="text-center py-3 px-4 text-yellow-400">Until reveal</td>
              <td className="text-center py-3 px-4 text-green-400">Never</td>
            </tr>
            <tr className="border-b border-white/5">
              <td className="py-3 px-4">Front-run protection</td>
              <td className="text-center py-3 px-4 text-red-400">None</td>
              <td className="text-center py-3 px-4 text-yellow-400">Partial</td>
              <td className="text-center py-3 px-4 text-green-400">Complete</td>
            </tr>
            <tr className="border-b border-white/5">
              <td className="py-3 px-4">User action needed</td>
              <td className="text-center py-3 px-4">Set order</td>
              <td className="text-center py-3 px-4">Commit + Reveal</td>
              <td className="text-center py-3 px-4 text-green-400">One tx</td>
            </tr>
            <tr className="border-b border-white/5">
              <td className="py-3 px-4">Stop hunting risk</td>
              <td className="text-center py-3 px-4 text-red-400">High</td>
              <td className="text-center py-3 px-4 text-yellow-400">Low</td>
              <td className="text-center py-3 px-4 text-green-400">Zero</td>
            </tr>
            <tr>
              <td className="py-3 px-4">Technology</td>
              <td className="text-center py-3 px-4">Broker DB</td>
              <td className="text-center py-3 px-4">Hash(price, salt)</td>
              <td className="text-center py-3 px-4 text-purple-400">Fhenix CoFHE</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FHEStats() {
  const { data: stats } = useReadContract({
    address: FHE_STOP_LOSS_ADDRESS,
    abi: FHE_STOP_LOSS_ABI,
    functionName: "getStats",
    chainId: ARB_SEPOLIA_CHAIN_ID,
  });

  const totalPositions = stats ? Number((stats as [bigint, bigint])[0]) : 0;
  const totalExecuted = stats ? Number((stats as [bigint, bigint])[1]) : 0;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
        <div className="text-sm text-zinc-400">FHE Positions</div>
        <div className="text-2xl font-bold text-purple-400">{totalPositions}</div>
      </div>
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
        <div className="text-sm text-zinc-400">Executed</div>
        <div className="text-2xl font-bold text-blue-400">{totalExecuted}</div>
      </div>
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <div className="text-sm text-zinc-400">Chain</div>
        <div className="text-2xl font-bold text-emerald-400">Arb Sepolia</div>
      </div>
    </div>
  );
}

function ContractInfo() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h3 className="text-lg font-bold text-white mb-4">Deployed Contracts (Arbitrum Sepolia)</h3>
      <div className="space-y-3 font-mono text-sm">
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">FHEStopLoss</span>
          <a
            href={`https://sepolia.arbiscan.io/address/${FHE_STOP_LOSS_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:text-purple-300 transition-colors"
          >
            {FHE_STOP_LOSS_ADDRESS.slice(0, 10)}...{FHE_STOP_LOSS_ADDRESS.slice(-8)}
          </a>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">Fhenix CoFHE</span>
          <span className="text-zinc-500">Coprocessor (off-chain)</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">Privacy Level</span>
          <span className="text-purple-400">Fully Homomorphic Encryption</span>
        </div>
      </div>
    </div>
  );
}

function ArchitectureDiagram() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h3 className="text-lg font-bold text-white mb-4">Architecture</h3>
      <pre className="text-xs text-zinc-400 overflow-x-auto leading-relaxed">
{`User encrypts stop price client-side (cofhejs)
        |
        v
[FHEStopLoss.sol] ---- stores euint128 encryptedStopPrice
  | Stop price is NEVER visible
  | Tokens locked in vault
  v
[CoFHE Coprocessor] <-- off-chain FHE compute
  |
  | FHE.lte(currentPrice, stopPrice)
  | Comparison on ENCRYPTED data
  v
[Threshold Network] --> decrypts only the boolean result
  |
  | shouldTrigger = true/false
  v
[Bot executes] --> USDC at market price --> User
               --> Stock tokens         --> Insurance Pool

Stop price: PERMANENTLY ENCRYPTED
MEV/Front-run: IMPOSSIBLE`}
      </pre>
    </div>
  );
}

function SwitchToArbSepolia() {
  const { switchChain } = useSwitchChain();

  return (
    <div className="rounded-2xl border border-purple-500/30 bg-purple-500/10 p-8 text-center">
      <div className="text-4xl mb-4">🔐</div>
      <h3 className="text-xl font-bold text-white mb-2">Switch to Arbitrum Sepolia</h3>
      <p className="text-zinc-400 mb-4">
        FHE privacy features require the Fhenix CoFHE coprocessor on Arbitrum Sepolia.
      </p>
      <Button
        onClick={() => switchChain({ chainId: ARB_SEPOLIA_CHAIN_ID })}
        className="bg-purple-600 hover:bg-purple-500 text-white"
      >
        Switch Network
      </Button>
    </div>
  );
}

export default function FHEPrivacyPage() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const isOnArbSepolia = chainId === ARB_SEPOLIA_CHAIN_ID;

  return (
    <main className="min-h-screen bg-black pt-24 pb-12">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-3 w-3 rounded-full bg-purple-500 animate-pulse" />
            <span className="text-sm font-medium text-purple-400">
              Fhenix CoFHE on Arbitrum Sepolia
            </span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">
            FHE Encrypted Stop-Losses
          </h1>
          <p className="text-lg text-zinc-400">
            Your stop price is encrypted with Fully Homomorphic Encryption. It is never
            visible on-chain. Not even during execution. Powered by{" "}
            <a
              href="https://github.com/Amity808/fhe-hook-template"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 underline"
            >
              Fhenix CoFHE
            </a>.
          </p>
        </div>

        <FHEExplainer />

        {isConnected && !isOnArbSepolia && <SwitchToArbSepolia />}

        <FHEStats />

        <ComparisonTable />

        <div className="grid gap-6 md:grid-cols-2">
          <ArchitectureDiagram />
          <ContractInfo />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-lg font-bold text-white mb-3">Multi-Chain Privacy Strategy</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4">
              <h4 className="font-semibold text-emerald-400 mb-1">Robinhood Chain (Today)</h4>
              <p className="text-sm text-zinc-400">
                Commit-reveal privacy via <code className="text-emerald-400">PrivateStopLoss.sol</code>.
                Stop price hidden by hash until reveal. Works on any EVM chain.
              </p>
            </div>
            <div className="rounded-xl bg-purple-500/5 border border-purple-500/20 p-4">
              <h4 className="font-semibold text-purple-400 mb-1">Arbitrum Sepolia (Today)</h4>
              <p className="text-sm text-zinc-400">
                FHE encryption via <code className="text-purple-400">FHEStopLoss.sol</code>.
                Stop price permanently encrypted. When Fhenix adds RH Chain support, deploys there too.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
