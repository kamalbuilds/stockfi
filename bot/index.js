/**
 * StockFi Price Bot
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
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const require = createRequire(import.meta.url);
require("dotenv").config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ─────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || "https://rpc.testnet.chain.robinhood.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY not set in .env");

// Deployed contract addresses — fill after running Deploy.s.sol
const VAULT_ADDRESS          = process.env.VAULT_ADDRESS          || "";
const PRIVATE_SL_ADDRESS     = process.env.PRIVATE_SL_ADDRESS     || "";
const TSLA_ORACLE_ADDRESS    = process.env.TSLA_ORACLE_ADDRESS    || "";
const AMZN_ORACLE_ADDRESS    = process.env.AMZN_ORACLE_ADDRESS    || "";
const PLTR_ORACLE_ADDRESS    = process.env.PLTR_ORACLE_ADDRESS    || "";
const NFLX_ORACLE_ADDRESS    = process.env.NFLX_ORACLE_ADDRESS    || "";
const AMD_ORACLE_ADDRESS     = process.env.AMD_ORACLE_ADDRESS     || "";

const UPDATE_INTERVAL_MS  = 30_000;  // push prices every 30s
const TRIGGER_CHECK_EVERY = 2;       // check triggers every N price-update cycles
const REGISTRY_PORT       = parseInt(process.env.BOT_PORT || "3001");
const REGISTRY_FILE       = path.join(__dirname, "commit-registry.json");

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
  "event StopLossCancelled(bytes32 indexed positionId, address indexed owner, uint256 tokensReturned)",
];

const PRIVATE_STOP_LOSS_ABI = [
  "function shouldTrigger(bytes32 positionId) external view returns (bool)",
  "function executeStopLoss(bytes32 positionId) external",
  "function revealAndExecute(bytes32 positionId, uint256 stopPrice, bytes32 salt) external",
  "event StopCommitted(bytes32 indexed positionId, address indexed owner, string ticker, address stockToken, uint256 amount, bytes32 commitHash, uint256 premiumPaid, uint256 revealDeadline)",
  "event StopRevealed(bytes32 indexed positionId, address indexed owner, uint256 stopPrice)",
  "event StopExecuted(bytes32 indexed positionId, address indexed owner, uint256 marketPrice, uint256 guaranteedPrice, uint256 gapCovered, uint256 usdcPaidToUser)",
  "event StopCancelled(bytes32 indexed positionId, address indexed owner, uint256 tokensReturned)",
];

// ─── State ───────────────────────────────────────────────────────────────────

let provider;
let signer;
let vault;
let privateSL;
const oracleContracts = {};

// Track known active position IDs (populated from events)
const activePositions = new Set();
const activePrivatePositions = new Set();

// ─── Keeper registry (positionId -> {stopPrice, salt, oracle}) ───────────────
// Populated by users registering via POST /register-commit or from file on startup.
// The bot holds salts off-chain and auto-reveals + executes when price drops.
// This gives commit-reveal the UX of FHE: stop price is NEVER visible on-chain.
const commitRegistry = new Map();

function loadRegistryFromDisk() {
  try {
    if (!fs.existsSync(REGISTRY_FILE)) return;
    const data = JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf8"));
    for (const entry of data) {
      commitRegistry.set(entry.positionId, {
        stopPrice: BigInt(entry.stopPrice),
        salt: entry.salt,
        oracle: entry.oracle,
      });
    }
    console.log(`[registry] Loaded ${commitRegistry.size} commits from disk`);
  } catch (err) {
    console.error("[registry] Failed to load from disk:", err.message);
  }
}

function saveRegistryToDisk() {
  try {
    const data = [];
    for (const [positionId, entry] of commitRegistry) {
      data.push({
        positionId,
        stopPrice: entry.stopPrice.toString(),
        salt: entry.salt,
        oracle: entry.oracle,
      });
    }
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("[registry] Failed to save to disk:", err.message);
  }
}

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
    // Remove cancelled positions
    const cancelFilter = vault.filters.StopLossCancelled();
    const cancelEvents = await vault.queryFilter(cancelFilter, fromBlock, "latest");
    for (const ev of cancelEvents) {
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

// ─── Private stop-loss: load revealed positions ──────────────────────────────

async function loadRevealedPrivatePositions() {
  if (!privateSL) return;
  try {
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 10000);
    // Only revealed positions can be triggered
    const revealFilter = privateSL.filters.StopRevealed();
    const revealEvents = await privateSL.queryFilter(revealFilter, fromBlock, "latest");
    for (const ev of revealEvents) {
      activePrivatePositions.add(ev.args.positionId);
    }
    // Remove executed
    const execFilter = privateSL.filters.StopExecuted();
    const execEvents = await privateSL.queryFilter(execFilter, fromBlock, "latest");
    for (const ev of execEvents) {
      activePrivatePositions.delete(ev.args.positionId);
    }
    // Remove cancelled
    const cancelFilter = privateSL.filters.StopCancelled();
    const cancelEvents = await privateSL.queryFilter(cancelFilter, fromBlock, "latest");
    for (const ev of cancelEvents) {
      activePrivatePositions.delete(ev.args.positionId);
    }
    console.log(`[private] Loaded ${activePrivatePositions.size} revealed private positions`);
  } catch (err) {
    console.error("[private] Failed to load:", err.message);
  }
}

async function checkAndExecutePrivateTriggers() {
  if (activePrivatePositions.size === 0) return;
  console.log(`[private-triggers] Checking ${activePrivatePositions.size} private positions...`);

  for (const positionId of activePrivatePositions) {
    try {
      const shouldExec = await privateSL.shouldTrigger(positionId);
      if (!shouldExec) continue;

      console.log(`  [PRIVATE-TRIGGER] Position ${positionId} triggered! Executing...`);
      const tx = await privateSL.executeStopLoss(positionId);
      const receipt = await tx.wait();
      console.log(`  [PRIVATE-EXECUTED] tx: ${tx.hash} (block ${receipt.blockNumber})`);
      activePrivatePositions.delete(positionId);
    } catch (err) {
      if (err.message.includes("not revealed") || err.message.includes("cannot cancel")) {
        activePrivatePositions.delete(positionId);
      } else {
        console.error(`  [err] Private execute failed ${positionId}:`, err.message);
      }
    }
  }
}

// ─── Keeper: auto-reveal + execute committed positions ───────────────────────

async function checkAndAutoRevealExecute() {
  if (commitRegistry.size === 0 || !privateSL) return;
  console.log(`[keeper] Checking ${commitRegistry.size} registered commits for auto-reveal...`);

  for (const [positionId, entry] of commitRegistry) {
    try {
      // Check oracle price for this stock
      const oracleContract = new ethers.Contract(entry.oracle, PRICE_ORACLE_ABI, provider);
      const price = await oracleContract.latestPrice();
      if (price <= 0n) continue;

      if (price > entry.stopPrice) {
        // Price still above stop — do nothing (stop price remains hidden)
        continue;
      }

      console.log(`  [KEEPER] Position ${positionId}: oracle $${Number(price) / 1e8} <= stop $${Number(entry.stopPrice) / 1e8} — auto-reveal-execute!`);
      const tx = await privateSL.revealAndExecute(positionId, entry.stopPrice, entry.salt);
      const receipt = await tx.wait();
      console.log(`  [KEEPER-EXECUTED] tx: ${tx.hash} (block ${receipt.blockNumber})`);
      commitRegistry.delete(positionId);
      activePrivatePositions.delete(positionId);
      saveRegistryToDisk();
    } catch (err) {
      // Position may already be executed/cancelled — clean up
      if (
        err.message.includes("not committed") ||
        err.message.includes("reveal expired") ||
        err.message.includes("cannot cancel")
      ) {
        commitRegistry.delete(positionId);
        saveRegistryToDisk();
      } else {
        console.error(`  [keeper-err] ${positionId}:`, err.message);
      }
    }
  }
}

// ─── HTTP server: frontend registers salts here ──────────────────────────────

function startRegistryServer() {
  const server = http.createServer((req, res) => {
    // CORS for local frontend dev
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "POST" && req.url === "/register-commit") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const { positionId, stopPrice, salt, oracle } = JSON.parse(body);
          if (!positionId || !stopPrice || !salt || !oracle) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Missing fields: positionId, stopPrice, salt, oracle" }));
            return;
          }
          commitRegistry.set(positionId, {
            stopPrice: BigInt(stopPrice),
            salt,
            oracle,
          });
          saveRegistryToDisk();
          console.log(`[registry] Registered keeper commit: positionId=${positionId} stop=$${Number(BigInt(stopPrice)) / 1e8}`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, positionId }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, registered: commitRegistry.size }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(REGISTRY_PORT, () => {
    console.log(`[registry] Keeper HTTP server listening on port ${REGISTRY_PORT}`);
    console.log(`  POST /register-commit  { positionId, stopPrice, salt, oracle }`);
    console.log(`  GET  /health`);
  });
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
  vault.on("StopLossCancelled", (positionId) => {
    console.log(`[event] Stop-loss cancelled: positionId=${positionId}`);
    activePositions.delete(positionId);
  });
  console.log("[events] Listening for StopLoss events...");
}

function listenForPrivatePositions() {
  if (!privateSL) return;
  privateSL.on("StopRevealed", (positionId, owner, stopPrice) => {
    console.log(`[event] Private stop revealed: positionId=${positionId} owner=${owner} stop=$${Number(stopPrice) / 1e8}`);
    activePrivatePositions.add(positionId);
  });
  privateSL.on("StopExecuted", (positionId) => {
    console.log(`[event] Private stop executed: positionId=${positionId}`);
    activePrivatePositions.delete(positionId);
  });
  privateSL.on("StopCancelled", (positionId) => {
    console.log(`[event] Private stop cancelled: positionId=${positionId}`);
    activePrivatePositions.delete(positionId);
  });
  console.log("[events] Listening for Private StopLoss events...");
}

// ─── Main loop ───────────────────────────────────────────────────────────────

async function main() {
  console.log("=== StockFi Price Bot ===");
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

  // Init private stop-loss
  if (PRIVATE_SL_ADDRESS) {
    privateSL = new ethers.Contract(PRIVATE_SL_ADDRESS, PRIVATE_STOP_LOSS_ABI, signer);
    await loadRevealedPrivatePositions();
    listenForPrivatePositions();
  } else {
    console.warn("[warn] PRIVATE_SL_ADDRESS not set — private stop-loss execution disabled");
  }

  // Load keeper registry (salts for auto-reveal-execute)
  loadRegistryFromDisk();
  startRegistryServer();

  // Initial price push
  await updateOracles();

  // Run keeper check immediately after first price push
  if (PRIVATE_SL_ADDRESS) await checkAndAutoRevealExecute();

  // Main loop
  let cycle = 0;
  setInterval(async () => {
    cycle++;
    await updateOracles();
    if (cycle % TRIGGER_CHECK_EVERY === 0) {
      if (VAULT_ADDRESS) await checkAndExecuteTriggers();
      if (PRIVATE_SL_ADDRESS) {
        await checkAndExecutePrivateTriggers();
        await checkAndAutoRevealExecute();
      }
    }
  }, UPDATE_INTERVAL_MS);

  console.log(`\nBot running. Updating prices every ${UPDATE_INTERVAL_MS / 1000}s.`);
  console.log("Press Ctrl+C to stop.\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
