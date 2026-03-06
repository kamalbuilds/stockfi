# StockForge: Gap-Proof Stop-Loss Protocol

**Your stop-loss at $270 fills at $250 after a gap. You lose $20/share. On StockForge, you get exactly $270. Guaranteed.**

Built for [Arbitrum Open House NYC](https://lu.ma/arbitrum-open-house-nyc) on Robinhood Chain (Arbitrum Orbit L3, chain 46630).

## The Problem

In TradFi, stop-loss orders can "gap through" during market crashes. Markets close at 4 PM, bad news hits overnight, and your stop at $270 fills at $250 when markets open. You lose $20/share with zero recourse.

This happens because:
- Markets close and prices gap at open
- Stop orders become market orders after trigger
- No mechanism to guarantee execution price

## The Solution

StockForge uses pre-funded insurance vaults on Robinhood Chain to guarantee stop-loss execution at the exact trigger price, even when markets gap through.

**Why this is only possible on-chain:**
- DeFi markets never close, so 24/7 monitoring is possible
- Smart contracts enforce pre-committed execution prices
- Insurance pool is pre-funded with USDC before any stop triggers
- Chainlink-compatible oracles provide real-time stock prices

## Architecture

```
User deposits TSLA + pays 2% premium
        |
        v
[StopLossVault] ---- premium ----> [GapInsurancePool]
  | Holds stock tokens                | LPs deposit USDC
  | Tracks stop price                 | Earn premiums
  |                                   | Cover gaps on execution
  v
[PriceOracle] <-- bot pushes stock prices every 30s
  |
  | price <= stopPrice?
  v
[Bot executes] --> USDC at guaranteed price --> User
               --> Stock tokens              --> Insurance Pool
```

## How It Works

### For Traders
1. **Deposit** stock tokens (TSLA, AMZN, PLTR, NFLX, AMD) and set your stop price
2. **Pay** a 2% insurance premium in USDC
3. **Sleep soundly** knowing your stop is guaranteed
4. When price drops to your stop, you receive **exactly** your guaranteed price in USDC

### For Insurance Providers (LPs)
1. **Deposit** USDC into the Gap Insurance Pool
2. **Earn** 2% premiums from every stop-loss created
3. When gaps occur, the pool covers the difference between market and guaranteed price
4. Pool receives discounted stock tokens (potential upside on recovery)

### The Bot
- Fetches real stock prices from Yahoo Finance every 30 seconds
- Pushes prices to on-chain PriceOracle contracts (Chainlink AggregatorV3 compatible)
- Monitors active positions and executes stop-losses when triggered

## Deployed Contracts (Robinhood Chain Testnet)

| Contract | Address |
|----------|---------|
| StopLossVault | `0xC5F9F5Dec04747205Cc2CEBe239A1b6790A7Dfe0` |
| GapInsurancePool | `0x59B830B926A87Ebb3995Ae77dA4822C50562002B` |
| MockUSDC | `0x7AbC92406af36935d967BF821b83776130401258` |
| TSLA Oracle | `0x3f7FC08150709C22F1741A230351B59c36bCCc8a` |
| AMZN Oracle | `0x2636Ed9F3Aa33589810BE07B48ad9Be79de3Fd7F` |
| PLTR Oracle | `0xcd8D3bFb6757504896a9320Dcb451e20d4baa74B` |
| NFLX Oracle | `0x95B4b7d7a23d954BF92FeDF2e00A374E22208D69` |
| AMD Oracle | `0xafA4230B7154d95F1c8Bc13AD443b2e50bde7C57` |

**Explorer:** [Blockscout](https://explorer.testnet.chain.robinhood.com)

## Tech Stack

- **Contracts:** Solidity 0.8.24, Foundry (21 tests passing)
- **Frontend:** Next.js 16, wagmi v3, viem, TailwindCSS, shadcn/ui
- **Bot:** Node.js, ethers.js v6, Yahoo Finance real-time prices
- **Chain:** Robinhood Chain Testnet (Arbitrum Orbit L3, chain 46630)

## Project Structure

```
stockforge/
  contracts/
    src/
      StopLossVault.sol      # Core gap-proof stop-loss vault
      GapInsurancePool.sol   # Two-sided insurance market
      PriceOracle.sol        # Chainlink AggregatorV3 compatible
      MockUSDC.sol           # Testnet mintable USDC
    test/
      StopLossVault.t.sol    # 21 comprehensive tests
    script/
      Deploy.s.sol           # Full deployment script
  frontend/                  # Next.js 16 + wagmi + shadcn
  bot/
    index.js                 # Price updater + stop executor
```

## Running Locally

### Contracts
```bash
cd contracts
forge build
forge test  # 21/21 tests
```

### Frontend
```bash
cd frontend
bun install
bun dev     # http://localhost:3000
```

### Bot
```bash
cd bot
cp .env.example .env  # Add PRIVATE_KEY + contract addresses
npm install
npm start
```

## E2E Verification

The full flow has been verified on-chain:
1. Created 1 TSLA stop-loss at $300 (market at $350)
2. Oracle price pushed to $295 (below stop)
3. `shouldTrigger()` returned true
4. `executeStopLoss()` succeeded, user received guaranteed USDC at $300
5. Insurance pool covered the $5/share gap

Transaction: [`0xaa68047e...`](https://explorer.testnet.chain.robinhood.com/tx/0xaa68047ef062810f96dca9346ca09fefc4f36191b7f192bae8dbea774b4f0c8e)

## Key Innovation

Traditional stop-losses are **reactive** (become market orders after trigger). StockForge stop-losses are **pre-committed** (execution price locked at creation via pre-funded insurance).

This means:
- No slippage on execution
- No gap risk from overnight/weekend closures
- Insurance pool absorbs downside, earns premiums
- Possible only because on-chain markets never close

## Team

Built at Arbitrum Open House NYC Founder House (March 6-8, 2026).
