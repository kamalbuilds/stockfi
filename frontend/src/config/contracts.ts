import { type Address } from "viem";

// ─── Robinhood Chain Testnet (chain 46630) ──────────────────────────────────
// Fill these in after running: forge script script/Deploy.s.sol --broadcast
export const VAULT_ADDRESS = "0xC5F9F5Dec04747205Cc2CEBe239A1b6790A7Dfe0" as Address;
export const INSURANCE_POOL_ADDRESS = "0x59B830B926A87Ebb3995Ae77dA4822C50562002B" as Address;

// PriceOracle addresses (one per stock)
export const ORACLES: Record<string, Address> = {
  TSLA: "0x3f7FC08150709C22F1741A230351B59c36bCCc8a" as Address,
  AMZN: "0x2636Ed9F3Aa33589810BE07B48ad9Be79de3Fd7F" as Address,
  PLTR: "0xcd8D3bFb6757504896a9320Dcb451e20d4baa74B" as Address,
  NFLX: "0x95B4b7d7a23d954BF92FeDF2e00A374E22208D69" as Address,
  AMD:  "0xafA4230B7154d95F1c8Bc13AD443b2e50bde7C57" as Address,
};

// Stock token addresses on Robinhood Chain Testnet
export const STOCK_TOKENS: Record<string, Address> = {
  TSLA: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E" as Address,
  AMZN: "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02" as Address,
  PLTR: "0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0" as Address,
  NFLX: "0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93" as Address,
  AMD:  "0x71178BAc73cBeb415514eB542a8995b82669778d" as Address,
};

export const USDC_ADDRESS = "0x7AbC92406af36935d967BF821b83776130401258" as Address;

export const RH_CHAIN_ID = 46630;
export const RH_CHAIN_RPC = "https://rpc.testnet.chain.robinhood.com";
export const RH_CHAIN_EXPLORER = "https://explorer.testnet.chain.robinhood.com";

// ─── Stop-loss status names ─────────────────────────────────────────────────
export function getStopLossStatusName(code: number): string {
  const map: Record<number, string> = {
    0: "ACTIVE",
    1: "EXECUTED",
    2: "CANCELLED",
  };
  return map[code] ?? "UNKNOWN";
}

export const STOP_LOSS_STATUS_COLORS: Record<string, string> = {
  ACTIVE:    "text-emerald-400",
  EXECUTED:  "text-blue-400",
  CANCELLED: "text-gray-400",
};

export const STOP_LOSS_STATUS_BG: Record<string, string> = {
  ACTIVE:    "bg-emerald-400/10 border-emerald-400/30",
  EXECUTED:  "bg-blue-400/10 border-blue-400/30",
  CANCELLED: "bg-gray-400/10 border-gray-400/30",
};

// ─── Supported stocks ───────────────────────────────────────────────────────
export const SUPPORTED_STOCKS = [
  { ticker: "TSLA", name: "Tesla",    color: "#E31937" },
  { ticker: "AMZN", name: "Amazon",   color: "#FF9900" },
  { ticker: "PLTR", name: "Palantir", color: "#8B5CF6" },
  { ticker: "NFLX", name: "Netflix",  color: "#E50914" },
  { ticker: "AMD",  name: "AMD",      color: "#ED1C24" },
];

// Distance-to-stop color coding
export function distanceColor(pct: number): string {
  if (pct < 105) return "text-red-400";      // <5% above stop: RED
  if (pct < 110) return "text-yellow-400";   // 5-10% above stop: YELLOW
  return "text-emerald-400";                  // >10% above stop: GREEN
}
