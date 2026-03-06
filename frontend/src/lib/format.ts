import { formatUnits } from "viem";

export function formatBigNumber(value: bigint, decimals: number = 18): string {
  return Number(formatUnits(value, decimals)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

export function formatUsd(value: bigint, decimals: number = 18): string {
  const num = Number(formatUnits(value, decimals));
  if (num >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(2)}M`;
  }
  if (num >= 1_000) {
    return `$${(num / 1_000).toFixed(2)}K`;
  }
  return `$${num.toFixed(2)}`;
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatPositionId(id: string): string {
  return `${id.slice(0, 10)}...${id.slice(-8)}`;
}

export function formatTimestamp(timestamp: bigint): string {
  if (timestamp === BigInt(0)) return "Never";
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleString();
}

export function timeAgo(timestamp: bigint): string {
  if (timestamp === BigInt(0)) return "Never";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - Number(timestamp);

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function getRiskColor(score: bigint): string {
  const s = Number(score);
  if (s <= 25) return "text-[#00D4AA]";
  if (s <= 50) return "text-yellow-400";
  if (s <= 75) return "text-orange-400";
  return "text-red-500";
}

export function getRiskBgColor(score: bigint): string {
  const s = Number(score);
  if (s <= 25) return "bg-[#00D4AA]";
  if (s <= 50) return "bg-yellow-400";
  if (s <= 75) return "bg-orange-400";
  return "bg-red-500";
}

export function getRiskLabel(score: bigint): string {
  const s = Number(score);
  if (s <= 25) return "Low Risk";
  if (s <= 50) return "Moderate Risk";
  if (s <= 75) return "High Risk";
  return "Critical Risk";
}

export function getSafetyRatioColor(ratio: bigint): string {
  const r = Number(ratio);
  if (r >= 200) return "text-[#00D4AA]";
  if (r >= 150) return "text-yellow-400";
  if (r >= 120) return "text-orange-400";
  return "text-red-500";
}
