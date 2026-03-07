"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect, useSwitchChain, useChainId } from "wagmi";
import { Button } from "@/components/ui/button";
import { formatAddress } from "@/lib/format";
import { injected } from "wagmi/connectors";
import { useState } from "react";
import { robinhoodChainTestnet, arbitrumSepolia } from "@/config/wagmi";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/ai-advisor", label: "AI Advisor" },
  { href: "/baskets", label: "Index Funds" },
  { href: "/create", label: "Stop-Loss" },
  { href: "/basket", label: "Create Basket" },
  { href: "/options", label: "Options" },
  { href: "/insurance", label: "Insurance" },
  { href: "/analytics", label: "Analytics" },
];

function ChainSelector() {
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const chains = [
    { id: robinhoodChainTestnet.id, name: "RH Chain", color: "#10B981" },
    { id: arbitrumSepolia.id, name: "Arb Sepolia", color: "#3B82F6" },
  ];

  const current = chains.find((c) => c.id === chainId) ?? chains[0];

  return (
    <div className="hidden sm:flex items-center">
      <select
        value={current.id}
        onChange={(e) => switchChain({ chainId: Number(e.target.value) })}
        className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-zinc-300 cursor-pointer appearance-none hover:bg-white/10 transition-colors"
        style={{ borderColor: current.color + "40" }}
      >
        {chains.map((c) => (
          <option key={c.id} value={c.id} className="bg-zinc-900 text-zinc-300">
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-black/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: '#10B981' }}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-5 w-5 text-white"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
            </div>
            <span className="text-lg font-bold text-white">StockFi</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  pathname === link.href
                    ? "text-white bg-white/10"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {isConnected && address ? (
              <div className="flex items-center gap-3">
                <ChainSelector />
                <div className="hidden sm:flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 border border-white/10">
                  <div className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-sm font-mono text-zinc-300">
                    {formatAddress(address)}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => disconnect()}
                  className="border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"
                >
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => connect({ connector: injected() })}
                className="text-white border-0 hover:opacity-90"
                style={{ background: '#10B981' }}
              >
                Connect Wallet
              </Button>
            )}

            <button
              className="md:hidden p-2 text-zinc-400 hover:text-white"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden pb-4 pt-2 border-t border-white/5">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  pathname === link.href
                    ? "text-white bg-white/10"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
