# StockFi: The DeFi Composability Layer for Tokenized Stocks

**Six composable financial primitives for tokenized equities. Baskets, insurance, options, privacy. All permissionless. All on Robinhood Chain.**

Create stock indexes in one transaction. Protect them with insurance-backed stop-losses. Earn yield by writing covered calls. Hide your stops from front-runners. This is the Bloomberg Terminal of on-chain stocks.

Built for [Arbitrum Open House NYC](https://lu.ma/arbitrum-open-house-nyc) on Robinhood Chain (Arbitrum Orbit L3, chain 46630).

**[Live Demo](https://stockforge-iota.vercel.app)** | **[GitHub](https://github.com/kamalbuilds/stockfi)** | **[Explorer](https://explorer.testnet.chain.robinhood.com)**

## The Problem

Stop-loss orders don't protect your price. They become market orders after trigger. You set $270, you get $250 in a fast-moving market. Put options solve this but require options knowledge, have expiry dates, and aren't available for tokenized stock tokens.

Robinhood Chain has tokenized stocks (TSLA, AMZN, PLTR, NFLX, AMD) as ERC-20s, but no native downside protection primitives.

## The Solution

StockFi is the DeFi composability layer for tokenized stocks. Six primitives that compose together:

**1. Permissionless Stock Baskets (EIP-7621 inspired)**
Create custom stock indexes in one transaction. `KTECH = 40% TSLA + 30% AMZN + 20% PLTR + 10% AMD`. In TradFi, creating an ETF costs $250K+ and requires SEC approval. On StockFi: one click.

**2. Insurance-Backed Stop-Losses**
Pay a 2% premium, get a price-guaranteed exit. A pre-funded pool absorbs gaps. Unlike dYdX/GMX stop-losses that execute at market price, StockFi pays your stop price (minus a 0.5% execution fee).

**3. Covered Call Options**
First permissionless covered call market for tokenized stocks. Writers deposit stock tokens and earn premium yield. Buyers get leveraged upside exposure. In TradFi, this requires options approval and a broker. Here: one transaction.

**4. Privacy Stop-Losses (Commit-Reveal)**
Hide your stop price on-chain. No front-running. No stop hunting. Commit hash(stopPrice, salt) then reveal when ready.

**5. Portfolio Insurance via BasketPriceOracle**
Insure your entire basket, not just individual stocks. One premium, total portfolio protection. Create a tech basket, set a stop-loss on the whole thing. This doesn't exist anywhere.

**6. Two-Sided Insurance Market**
LPs deposit USDC, earn 2% premiums, receive discounted stock tokens when gaps occur. A built-in buy-the-dip strategy with yield.

**The composability story:** Create a basket (1). Set a portfolio stop-loss (2+5). Earn yield on idle tokens (3). Hide your strategy (4). Insurance providers earn yield (6). Six primitives, one platform.

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

[PrivateStopLoss] -- commit-reveal privacy layer
  | Phase 1: Commit hash(stopPrice, salt) -- price hidden on-chain
  | Phase 2: Reveal actual stop price -- arms the trigger
  | Phase 3: Bot executes when price drops -- same guaranteed payout
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
| StopLossVault | `0xc1dC88DDA382D20e6F2f3F832CE941eE0369c788` |
| GapInsurancePool | `0xaC7681429000c66657a4c8e042f8A0C4a5f9C040` |
| MockUSDC | `0xb3485Da6BB50843a20F321653869556Dc1E2F3c2` |
| TSLA Oracle | `0x3f7FC08150709C22F1741A230351B59c36bCCc8a` |
| AMZN Oracle | `0x2636Ed9F3Aa33589810BE07B48ad9Be79de3Fd7F` |
| PLTR Oracle | `0xcd8D3bFb6757504896a9320Dcb451e20d4baa74B` |
| NFLX Oracle | `0x95B4b7d7a23d954BF92FeDF2e00A374E22208D69` |
| AMD Oracle | `0xafA4230B7154d95F1c8Bc13AD443b2e50bde7C57` |
| BasketFactory | `0x1A208C7A48C6102ABB61912d162aF8f7D1210856` |
| PrivateStopLoss | `0x758bbd638CdE4094F61c51f43D4A238b08675E70` |
| CoveredCallVault | `0x4369b5e5866C705f123EAA6a8f22dA6E03D92395` |
| BasketPriceOracle | `0xe7C6578465F29b9820f57937eAc9B6E3f932609c` |

**Explorer:** [Blockscout](https://explorer.testnet.chain.robinhood.com)

## Deployed Contracts (Arbitrum Sepolia + Fhenix FHE)

| Contract | Address |
|----------|---------|
| FHEStopLoss | `0x95B4b7d7a23d954BF92FeDF2e00A374E22208D69` |
| GapInsurancePool | `0xcd8D3bFb6757504896a9320Dcb451e20d4baa74B` |
| MockUSDC | `0x3f7FC08150709C22F1741A230351B59c36bCCc8a` |
| TSLA Oracle | `0x2636Ed9F3Aa33589810BE07B48ad9Be79de3Fd7F` |

**Explorer:** [Arbiscan](https://sepolia.arbiscan.io)

## Tech Stack

- **Contracts:** Solidity 0.8.26, Foundry (130 tests passing)
- **FHE:** Fhenix CoFHE (`@fhenixprotocol/cofhe-contracts`) for encrypted stop prices
- **Frontend:** Next.js 16, wagmi v3, viem, TailwindCSS, shadcn/ui
- **Bot:** Node.js, ethers.js v6, Yahoo Finance real-time prices
- **Chains:** Robinhood Chain Testnet (chain 46630) + Arbitrum Sepolia (chain 421614)

## Project Structure

```
stockforge/
  contracts/
    src/
      StopLossVault.sol      # Insurance-backed stop-loss vault
      GapInsurancePool.sol   # Two-sided insurance market
      BasketFactory.sol      # Permissionless stock index creation
      BasketToken.sol        # ERC-20 basket token (EIP-7621 inspired)
      PrivateStopLoss.sol    # Commit-reveal privacy stop-losses
      CoveredCallVault.sol   # Permissionless covered call options
      BasketPriceOracle.sol  # AggregatorV3 wrapper for basket prices
      FHEStopLoss.sol        # Fhenix FHE encrypted stop-losses (Arb Sepolia)
      PriceOracle.sol        # Chainlink AggregatorV3 compatible
      MockUSDC.sol           # Testnet mintable USDC
    test/
      StopLossVault.t.sol    # 30 stop-loss tests
      BasketFactory.t.sol    # 15 basket tests
      PrivateStopLoss.t.sol  # 27 privacy tests
      CoveredCallVault.t.sol # 29 covered call tests
      BasketPriceOracle.t.sol # 8 composability tests
      FHEStopLoss.t.sol      # 21 FHE encryption tests
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
forge test  # 130/130 tests (30 vault + 15 basket + 27 privacy + 29 options + 8 composability + 21 FHE)
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

The full flow has been verified on-chain (latest deployment):
1. Created AMZN stop-loss at $200 (market at $214.92)
2. Created PLTR stop-loss at $140 (market at $159.51)
3. Oracle price pushed to $195 (below AMZN stop)
4. `shouldTrigger()` returned true
5. `executeStopLoss()` succeeded, user received USDC at $200 guaranteed price
6. Insurance pool covered the $5/share gap ($195 market vs $200 guaranteed)
7. Pool stats: $26.64 premiums earned, $5.47 gaps covered

Create AMZN tx: [`0x77ad75c9...`](https://explorer.testnet.chain.robinhood.com/tx/0x77ad75c90b579782ce96073ad427caa3ec957f0bf16eb4ff3fe701e25defddff)
Create PLTR tx: [`0xae26710c...`](https://explorer.testnet.chain.robinhood.com/tx/0xae26710cab1c77680c4d2ed7b9d3403d7cebd3b696876e949a20d1cd0165da1c)
Execute AMZN tx: [`0x6a65b064...`](https://explorer.testnet.chain.robinhood.com/tx/0x6a65b0649a00b6a8c6377e9769768695ef64da0f36a8ce7c0918d619d15b92b5)

## Key Innovation

StockFi is not an app. It's the **financial infrastructure layer** for tokenized stock DeFi. Seven composable primitives across two chains:

| Primitive | What It Does | TradFi Equivalent | Why It's Better |
|-----------|-------------|-------------------|-----------------|
| **BasketFactory** | Custom stock indexes as ERC-20 | ETF ($250K+ to create) | Free, instant, permissionless |
| **StopLossVault** | Insurance-backed stop-losses | Put options ($5K+ minimum) | One click, no expiry, no Greeks |
| **CoveredCallVault** | Earn yield on idle stocks | Covered call writing (broker required) | Permissionless, 24/7, instant settlement |
| **PrivateStopLoss** | Hidden stop prices (commit-reveal) | Dark pool orders | On-chain, transparent, anti-front-running |
| **FHEStopLoss** | FHE-encrypted stop prices (Fhenix) | Nothing exists | Stop price NEVER revealed, even during execution |
| **BasketPriceOracle** | Portfolio-level stop-losses | Portfolio insurance (institutions only) | Any basket, any user, one premium |
| **GapInsurancePool** | Two-sided insurance market | Insurance underwriting | Anyone can be an LP, earn yield |

**Multi-Chain Privacy:**
- **Robinhood Chain**: Commit-reveal privacy (PrivateStopLoss) - stop price hidden until reveal
- **Arbitrum Sepolia**: Fhenix FHE encryption (FHEStopLoss) - stop price PERMANENTLY encrypted via homomorphic computation. `FHE.lte(currentPrice, stopPrice)` compares encrypted values. MEV bots see nothing.

**The Composability Story:**
1. Create a tech basket: `KTECH = 40% TSLA + 30% AMZN + 20% PLTR + 10% AMD`
2. Insure the entire basket with a stop-loss using BasketPriceOracle
3. Write covered calls on individual stocks to earn premium yield
4. Hide your stop strategy with commit-reveal privacy OR FHE encryption
5. Insurance LPs earn premiums and buy the dip automatically

Five transactions. Complete financial infrastructure across two chains. Only possible because stock tokens are ERC-20s on programmable blockchains.

## FAQ

**Q: How is this different from a put option?**
A: Same economic outcome (guaranteed floor price), but simpler UX (one click, no expiry, no strike selection), and permissionless underwriting (anyone can be an LP, not just institutions).

**Q: How is this different from dYdX/GMX stop-losses?**
A: Those trade synthetic perps. StockFi protects actual tokenized stock tokens (TSLA ERC-20s on RH Chain) with a pre-funded insurance pool that absorbs price impact.

**Q: What if the pool runs out?**
A: The pool has an 80% utilization cap. New stop-losses are rejected when the pool is over-utilized. LPs always see pool health metrics on the insurance page.

## Team

Built at Arbitrum Open House NYC Founder House (March 6-8, 2026).
