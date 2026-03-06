/**
 * StockForge Price Bot
 * - Fetches real stock prices via Yahoo Finance (unofficial JSON endpoint)
 * - Pushes prices to PriceOracle contracts every 30 seconds
 * - Monitors active stop-loss positions and executes when triggered
 *
 * Usage:
 *   cp .env.example .env   # fill in PRIVATE_KEY + contract addresses
 *   npm start
 */

import { ethers } from "ethers";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
require("dotenv").config();

// ─── Config ─────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || "https://rpc.testnet.chain.robinhood.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY not set in .env");

// Deployed contract addresses — fill after running Deploy.s.sol
const VAULT_ADDRESS          = process.env.VAULT_ADDRESS          || "";
const TSLA_ORACLE_ADDRESS    = process.env.TSLA_ORACLE_ADDRESS    || "";
const AMZN_ORACLE_ADDRESS    = process.env.AMZN_ORACLE_ADDRESS    || "";
const PLTR_ORACLE_ADDRESS    = process.env.PLTR_ORACLE_ADDRESS    || "";
const NFLX_ORACLE_ADDRESS    = process.env.NFLX_ORACLE_ADDRESS    || "";
const AMD_ORACLE_ADDRESS     = process.env.AMD_ORACLE_ADDRESS     || "";

const UPDATE_INTERVAL_MS  = 30_000;  // push prices every 30s
const TRIGGER_CHECK_EVERY = 2;       // check triggers every N price-update cycles

// Stock tickers → Yahoo Finance symbol → oracle address
const STOCKS = [
  { ticker: "TSLA", symbol: "TSLA", oracle: TSLA_ORACLE_ADDRESS },
  { ticker: "AMZN", symbol: "AMZN", oracle: AMZN_ORACLE_ADDRESS },
  { ticker: "PLTR", symbol: "PLTR", oracle: PLTR_ORACLE_ADDRESS },
  { ticker: "NFLX", symbol: "NFLX", oracle: NFLX_ORACLE_ADDRESS },
  { ticker: "AMD",  symbol: "AMD",  oracle: AMD_ORACLE_ADDRESS  },
];

// ─── ABIs ────────────────────────────────────────────────────────────────────

const PRICE_ORACLE_ABI = [
  "function updatePrice(int256 _answer) external",
  "function latestPrice() external view returns (int256)",
  "event PriceUpdated(uint80 indexed roundId, int256 answer, uint256 updatedAt)",
];

const STOP_LOSS_VAULT_ABI = [
  "function shouldTrigger(bytes32 positionId) external view returns (bool)",
  "function executeStopLoss(bytes32 positionId) external",
  "function totalPositions() external view returns (uint256)",
  "function getUserPositions(address user) external view returns (bytes32[])",
  "event StopLossCreated(bytes32 indexed positionId, address indexed owner, string ticker, address stockToken, uint256 amount, uint256 stopPrice, uint256 premiumPaid)",
  "event StopLossExecuted(bytes32 indexed positionId, address indexed owner, uint256 marketPrice, uint256 guaranteedPrice, uint256 gapCovered, uint256 usdcPaidToUser, uint256 stockTokensToPool)",
];

// ─── State ───────────────────────────────────────────────────────────────────

let provider;
let signer;
let vault;
const oracleContracts = {};

// Track known active position IDs (populated from events)
const activePositions = new Set();

// ─── Price fetching (Yahoo Finance unofficial JSON) ───────────────────────────

async function fetchStockPrice(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1m`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice ?? meta?.previousClose;
    if (!price || price <= 0) throw new Error("No price in response");
    return price;
  } catch (err) {
    console.error(`[price] Failed to fetch ${symbol}:`, err.message);
    return null;
  }
}

// ─── Convert float price to 8-decimal int (Chainlink standard) ───────────────

function toChainlinkPrice(floatPrice) {
  return BigInt(Math.round(floatPrice * 1e8));
}

// ─── Push prices to oracles ──────────────────────────────────────────────────

async function updateOracles() {
  console.log(`\n[${new Date().toISOString()}] Updating oracle prices...`);

  for (const stock of STOCKS) {
    if (!stock.oracle) {
      console.warn(`  [skip] ${stock.ticker}: no oracle address set`);
      continue;
    }

    const price = await fetchStockPrice(stock.symbol);
    if (!price) continue;

    const chainlinkPrice = toChainlinkPrice(price);
    console.log(`  ${stock.ticker}: $${price.toFixed(2)} -> ${chainlinkPrice} (8 dec)`);

    try {
      const oracle = oracleContracts[stock.ticker];
      const tx = await oracle.updatePrice(chainlinkPrice);
      await tx.wait();
      console.log(`  [ok] ${stock.ticker} oracle updated. tx: ${tx.hash}`);
    } catch (err) {
      console.error(`  [err] ${stock.ticker} oracle update failed:`, err.message);
      // Could be price jump >50% sanity check — log and continue
    }
  }
}

// ─── Scan for and load active positions ──────────────────────────────────────

async function loadActivePositions() {
  if (!vault) return;
  try {
    // Listen for StopLossCreated events from the last 10000 blocks
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 10000);
    const filter = vault.filters.StopLossCreated();
    const events = await vault.queryFilter(filter, fromBlock, "latest");
    for (const ev of events) {
      activePositions.add(ev.args.positionId);
    }
    // Remove executed positions
    const execFilter = vault.filters.StopLossExecuted();
    const execEvents = await vault.queryFilter(execFilter, fromBlock, "latest");
    for (const ev of execEvents) {
      activePositions.delete(ev.args.positionId);
    }
    console.log(`[positions] Loaded ${activePositions.size} active positions`);
  } catch (err) {
    console.error("[positions] Failed to load:", err.message);
  }
}

// ─── Check and execute triggered stop-losses ─────────────────────────────────

async function checkAndExecuteTriggers() {
  if (activePositions.size === 0) return;
  console.log(`[triggers] Checking ${activePositions.size} positions...`);

  for (const positionId of activePositions) {
    try {
      const shouldExec = await vault.shouldTrigger(positionId);
      if (!shouldExec) continue;

      console.log(`  [TRIGGER] Position ${positionId} is triggered! Executing...`);
      const tx = await vault.executeStopLoss(positionId);
      const receipt = await tx.wait();
      console.log(`  [EXECUTED] tx: ${tx.hash} (block ${receipt.blockNumber})`);
      activePositions.delete(positionId);
    } catch (err) {
      // cooldown active or already executed — safe to ignore
      if (err.message.includes("cooldown active") || err.message.includes("not active")) {
        activePositions.delete(positionId);
      } else {
        console.error(`  [err] Failed to execute ${positionId}:`, err.message);
      }
    }
  }
}

// ─── Event listener: track new positions in real time ────────────────────────

function listenForNewPositions() {
  if (!vault) return;
  vault.on("StopLossCreated", (positionId, owner, ticker) => {
    console.log(`[event] New stop-loss created: ${ticker} positionId=${positionId} owner=${owner}`);
    activePositions.add(positionId);
  });
  vault.on("StopLossExecuted", (positionId) => {
    console.log(`[event] Stop-loss executed: positionId=${positionId}`);
    activePositions.delete(positionId);
  });
  console.log("[events] Listening for StopLoss events...");
}

// ─── Main loop ───────────────────────────────────────────────────────────────

async function main() {
  console.log("=== StockForge Price Bot ===");
  console.log(`RPC: ${RPC_URL}`);

  provider = new ethers.JsonRpcProvider(RPC_URL);
  signer = new ethers.Wallet(PRIVATE_KEY, provider);

  const network = await provider.getNetwork();
  console.log(`Connected to chain ${network.chainId}`);
  console.log(`Bot address: ${signer.address}`);

  // Init oracle contracts
  for (const stock of STOCKS) {
    if (stock.oracle) {
      oracleContracts[stock.ticker] = new ethers.Contract(stock.oracle, PRICE_ORACLE_ABI, signer);
    }
  }

  // Init vault
  if (VAULT_ADDRESS) {
    vault = new ethers.Contract(VAULT_ADDRESS, STOP_LOSS_VAULT_ABI, signer);
    await loadActivePositions();
    listenForNewPositions();
  } else {
    console.warn("[warn] VAULT_ADDRESS not set — stop-loss execution disabled");
  }

  // Initial price push
  await updateOracles();

  // Main loop
  let cycle = 0;
  setInterval(async () => {
    cycle++;
    await updateOracles();
    if (VAULT_ADDRESS && cycle % TRIGGER_CHECK_EVERY === 0) {
      await checkAndExecuteTriggers();
    }
  }, UPDATE_INTERVAL_MS);

  console.log(`\nBot running. Updating prices every ${UPDATE_INTERVAL_MS / 1000}s.`);
  console.log("Press Ctrl+C to stop.\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
