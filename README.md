# StockForge: Insurance-Backed Stop-Loss for Tokenized Stocks

**The first permissionless insurance market for downside protection on tokenized equities.**

A pre-funded insurance pool pays you your stop price. One-click protection, simpler than options, built natively for Robinhood Chain.

Built for [Arbitrum Open House NYC](https://lu.ma/arbitrum-open-house-nyc) on Robinhood Chain (Arbitrum Orbit L3, chain 46630).

## The Problem

Stop-loss orders don't protect your price. They become market orders after trigger. You set $270, you get $250 in a fast-moving market. Put options solve this but require options knowledge, have expiry dates, and aren't available for tokenized stock tokens.

Robinhood Chain has tokenized stocks (TSLA, AMZN, PLTR, NFLX, AMD) as ERC-20s, but no native downside protection primitives.

## The Solution

StockForge is a two-sided insurance market. Users pay a 2% premium for price-guaranteed stop-losses. Insurance providers (LPs) deposit USDC, earn premiums, and take the other side of downside risk. When a stop triggers, the pool pays the user at the exact stop price, regardless of where the market is.

**What makes this different from perp DEX stop-losses (dYdX, GMX):**
- Those trade synthetic perps. StockForge protects **real tokenized stock tokens** (TSLA, AMZN ERC-20s)
- Those have no insurance backing. StockForge has a pre-funded pool that absorbs slippage
- Those require active trading. StockForge is set-and-forget protection (like a put option, but simpler)

**What makes this different from put options:**
- No options knowledge required (one-click protection)
- No expiry dates (protection lasts until triggered or cancelled)
- Anyone can be an insurance provider (permissionless underwriting, not just institutions)
- Native to tokenized equities on Robinhood Chain

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
4. When price drops to your stop, you receive USDC at your guaranteed stop price (minus a 0.5% execution fee)

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
| StopLossVault | `0xfC524784E58bC565b6F28A09E8C7449487441ebc` |
| GapInsurancePool | `0xaC7681429000c66657a4c8e042f8A0C4a5f9C040` |
| MockUSDC | `0xb3485Da6BB50843a20F321653869556Dc1E2F3c2` |
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

StockForge is the **first permissionless insurance market for tokenized stock downside protection**.

- **For users:** One-click protection simpler than options, with no expiry. Pay 2%, get price-guaranteed exits.
- **For LPs:** Earn premiums by underwriting gap risk. Receive discounted stock tokens on execution (buy-the-dip exposure).
- **For the ecosystem:** A new DeFi primitive native to Robinhood Chain's tokenized equities. Composable, permissionless, and built for retail.

The two-sided flywheel: more users = more premiums for LPs. More LPs = more capacity for users. Insurance pools are a proven DeFi primitive (Nexus Mutual, InsurAce) but nobody has applied them to tokenized stock downside protection.

## FAQ

**Q: How is this different from a put option?**
A: Same economic outcome (guaranteed floor price), but simpler UX (one click, no expiry, no strike selection), and permissionless underwriting (anyone can be an LP, not just institutions).

**Q: How is this different from dYdX/GMX stop-losses?**
A: Those trade synthetic perps. StockForge protects actual tokenized stock tokens (TSLA ERC-20s on RH Chain) with a pre-funded insurance pool that absorbs price impact.

**Q: What if the pool runs out?**
A: The pool has an 80% utilization cap. New stop-losses are rejected when the pool is over-utilized. LPs always see pool health metrics on the insurance page.

## Team

Built at Arbitrum Open House NYC Founder House (March 6-8, 2026).
