"use client";

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
              <th className="text-center py-3 px-4 text-emerald-400 font-medium">Commit-Reveal</th>
              <th className="text-center py-3 px-4 text-purple-400 font-medium">FHE (Future)</th>
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

export default function FHEPrivacyPage() {
  return (
    <main className="min-h-screen bg-black pt-24 pb-12">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-3 w-3 rounded-full bg-purple-500 animate-pulse" />
            <span className="text-sm font-medium text-purple-400">
              Privacy Roadmap
            </span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">
            FHE Encrypted Stop-Losses
          </h1>
          <p className="text-lg text-zinc-400">
            Your stop price encrypted with Fully Homomorphic Encryption. Never
            visible on-chain, not even during execution. A future upgrade path for StockFi
            when FHE coprocessors launch on Robinhood Chain.
          </p>
        </div>

        <FHEExplainer />
        <ComparisonTable />

        <div className="grid gap-6 md:grid-cols-2">
          <ArchitectureDiagram />
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-lg font-bold text-white mb-4">Privacy on StockFi Today</h3>
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4">
                <h4 className="font-semibold text-emerald-400 mb-1">Commit-Reveal (Live)</h4>
                <p className="text-sm text-zinc-400">
                  <code className="text-emerald-400">PrivateStopLoss.sol</code> on Robinhood Chain.
                  Stop price hidden by hash until reveal. Works today with no extra infrastructure.
                </p>
              </div>
              <div className="rounded-xl bg-purple-500/5 border border-purple-500/20 p-4">
                <h4 className="font-semibold text-purple-400 mb-1">FHE (Roadmap)</h4>
                <p className="text-sm text-zinc-400">
                  <code className="text-purple-400">FHEStopLoss.sol</code> with Fhenix CoFHE.
                  Stop price permanently encrypted. Waiting for FHE coprocessor support on RH Chain.
                  Smart contract is written and tested (21/21 tests passing).
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
