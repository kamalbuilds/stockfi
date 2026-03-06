"use client";

import { VAULT_ADDRESS, RH_CHAIN_EXPLORER } from "@/config/contracts";

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-black/50 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: '#10B981' }}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-4 w-4 text-white"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
            </div>
            <span className="text-sm text-zinc-500">StockForge - Gap-Proof Stop-Loss</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-zinc-600">
            <span>Robinhood Chain Testnet (46630)</span>
            {VAULT_ADDRESS && (
              <a
                href={`${RH_CHAIN_EXPLORER}/address/${VAULT_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-zinc-400 transition-colors font-mono"
              >
                {VAULT_ADDRESS.slice(0, 10)}...
              </a>
            )}
            <span>Built for Arbitrum Open House NYC 2026</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
