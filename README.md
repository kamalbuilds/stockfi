# StockFi

### Stop-losses that actually stop your loss.

The DeFi composability layer for tokenized stocks on Robinhood Chain.

In TradFi, a stop-loss at $270 fills at $250 when markets gap overnight. You lose $20/share you thought you were protected from. On StockFi, you get exactly $270. A pre-funded insurance pool absorbs the gap. This is only possible because DeFi markets never close and smart contracts enforce pre-committed execution.

**[Live Demo](https://stockfi.vercel.app)** | **[Explorer](https://explorer.testnet.chain.robinhood.com)** | Built at [Arbitrum Open House NYC](https://lu.ma/arbitrum-open-house-nyc) (March 6-8, 2026)

---

## The Gap Problem

```
TradFi Stop-Loss                          StockFi Stop-Loss
─────────────────                         ─────────────────

  TSLA at $300                              TSLA at $300
  Stop set at $270                          Stop set at $270
       │                                         │
  Market closes 4 PM                        DeFi never closes
       │                                         │
  Bad earnings after hours                  Price drops to $265
       │                                         │
  Market opens at $250                      Smart contract executes
       │                                         │
  Stop fills at $250                        You get exactly $270
       │                                         │
  YOU LOSE $20/share                        Insurance pool absorbs
  you thought you                           the $5 gap
  were protected from
                                            YOU GET YOUR PRICE.
```

## Six Financial Primitives

| # | Primitive | What It Does | TradFi Equivalent | Why StockFi Is Better |
|---|-----------|-------------|-------------------|----------------------|
| 1 | **Insurance-Backed Stop-Losses** | Pay 2% premium, get price-guaranteed exit | Put options ($5K+ min) | One click, no expiry, no Greeks |
| 2 | **Permissionless Stock Baskets** | Custom indexes as ERC-20 tokens | ETF ($250K+ to create) | Free, instant, permissionless |
| 3 | **Two-Sided Insurance Market** | LPs earn premiums, buy dips automatically | Insurance underwriting | Anyone can be an LP |
| 4 | **Covered Call Options** | Earn yield on idle stock tokens | Covered calls (broker required) | Permissionless, 24/7 |
| 5 | **Privacy Stop-Losses** | Hide stop price via commit-reveal | Dark pool orders | On-chain, anti-front-running |
| 6 | **Portfolio Basket Insurance** | Insure entire basket with one premium | Portfolio insurance (institutions) | Any basket, any user |

**Composability:** Create a basket (2) → Set a portfolio stop-loss (1+6) → Earn yield on idle tokens (4) → Hide your strategy (5) → LPs earn yield (3). One platform, six primitives.

## How It Works

### For Traders
1. **Deposit** stock tokens (TSLA, AMZN, PLTR, NFLX, AMD) and set your stop price
2. **Pay** a 2% insurance premium in USDC
3. **Sleep soundly** knowing your stop is guaranteed
4. When price drops to your stop, you receive USDC at your exact guaranteed price (minus 0.5% execution fee)

### For Insurance LPs
1. **Deposit** USDC into the Gap Insurance Pool
2. **Earn** 2% premiums from every stop-loss created
3. When gaps occur, the pool covers the difference between market and guaranteed price
4. Pool receives discounted stock tokens (potential upside on recovery)

### The Price Bot
- Fetches real stock prices from Yahoo Finance every 30 seconds
- Pushes to on-chain PriceOracle contracts (Chainlink AggregatorV3 compatible)
- Monitors all active positions via `shouldTrigger()`
- Executes stop-losses automatically when triggered

## E2E Verification

The full flow has been verified on-chain:

```
1. Created AMZN stop-loss at $200 (market at $214.92)
2. Created PLTR stop-loss at $140 (market at $159.51)
3. Oracle price pushed to $195 (below AMZN stop)
4. shouldTrigger() returned true
5. executeStopLoss() succeeded
6. User received USDC at $200 guaranteed price
7. Insurance pool covered the $5/share gap ($195 market vs $200 guaranteed)
8. Pool stats: $26.64 premiums earned, $5.47 gaps covered
```

| Transaction | Hash |
|-------------|------|
| Create AMZN stop | [`0x77ad75c9...`](https://explorer.testnet.chain.robinhood.com/tx/0x77ad75c90b579782ce96073ad427caa3ec957f0bf16eb4ff3fe701e25defddff) |
| Create PLTR stop | [`0xae26710c...`](https://explorer.testnet.chain.robinhood.com/tx/0xae26710cab1c77680c4d2ed7b9d3403d7cebd3b696876e949a20d1cd0165da1c) |
| Execute AMZN stop | [`0x6a65b064...`](https://explorer.testnet.chain.robinhood.com/tx/0x6a65b0649a00b6a8c6377e9769768695ef64da0f36a8ce7c0918d619d15b92b5) |

## Deployed Contracts

All contracts deployed and verified on **Robinhood Chain Testnet** (Arbitrum Orbit L3, chain 46630).

| Contract | Address | Purpose |
|----------|---------|---------|
| StopLossVault | [`0xc1dC88...c788`](https://explorer.testnet.chain.robinhood.com/address/0xc1dC88DDA382D20e6F2f3F832CE941eE0369c788) | Insurance-backed stop-losses |
| GapInsurancePool | [`0xaC7681...9C040`](https://explorer.testnet.chain.robinhood.com/address/0xaC7681429000c66657a4c8e042f8A0C4a5f9C040) | Two-sided insurance market |
| BasketFactory | [`0x1A208C...0856`](https://explorer.testnet.chain.robinhood.com/address/0x1A208C7A48C6102ABB61912d162aF8f7D1210856) | Permissionless basket creation |
| CoveredCallVault | [`0x4369b5...2395`](https://explorer.testnet.chain.robinhood.com/address/0x4369b5e5866C705f123EAA6a8f22dA6E03D92395) | Covered call options |
| PrivateStopLoss | [`0x758bbd...8C93`](https://explorer.testnet.chain.robinhood.com/address/0x758bbd638CdE4094F61c51f43D4A238b08675E70) | Commit-reveal privacy stops |
| BasketPriceOracle | [`0xe7C657...09c`](https://explorer.testnet.chain.robinhood.com/address/0xe7C6578465F29b9820f57937eAc9B6E3f932609c) | Basket NAV aggregator |
| MockUSDC | [`0xb3485D...F3c2`](https://explorer.testnet.chain.robinhood.com/address/0xb3485Da6BB50843a20F321653869556Dc1E2F3c2) | Testnet USDC |
| TSLA Oracle | [`0x3f7FC0...Cc8a`](https://explorer.testnet.chain.robinhood.com/address/0x3f7FC08150709C22F1741A230351B59c36bCCc8a) | TSLA price feed |
| AMZN Oracle | [`0x2636Ed...Fd7F`](https://explorer.testnet.chain.robinhood.com/address/0x2636Ed9F3Aa33589810BE07B48ad9Be79de3Fd7F) | AMZN price feed |
| PLTR Oracle | [`0xcd8D3b...74B`](https://explorer.testnet.chain.robinhood.com/address/0xcd8D3bFb6757504896a9320Dcb451e20d4baa74B) | PLTR price feed |
| NFLX Oracle | [`0x95B4b7...D69`](https://explorer.testnet.chain.robinhood.com/address/0x95B4b7d7a23d954BF92FeDF2e00A374E22208D69) | NFLX price feed |
| AMD Oracle | [`0xafA423...Ad57`](https://explorer.testnet.chain.robinhood.com/address/0xafA4230B7154d95F1c8Bc13AD443b2e50bde7C57) | AMD price feed |

## On-Chain Baskets

3 pre-made stock index baskets deployed via BasketFactory:

| Basket | Composition | On-Chain |
|--------|-------------|----------|
| **KTECH** | 40% TSLA + 30% AMZN + 20% PLTR + 10% AMD | [`0x97aB...1096`](https://explorer.testnet.chain.robinhood.com/address/0x97aB4e62f418e5F309e58aF3E8aD90a5d93E1096) |
| **STREAMING** | 50% NFLX + 25% AMZN + 15% TSLA + 10% PLTR | [`0xCa5D...dBD0`](https://explorer.testnet.chain.robinhood.com/address/0xCa5D7e6b1A42c6E935f63C28859C4D0c6b42dBD0) |
| **CHIPS&AI** | 40% AMD + 35% PLTR + 15% TSLA + 10% AMZN | [`0x9F65...a428`](https://explorer.testnet.chain.robinhood.com/address/0x9F65a1C8b9e5F3D2c4A7B6E8d0F2a3C5b7D9a428) |

## Architecture

```
                                    ┌─────────────────────────────────────────┐
                                    │          ROBINHOOD CHAIN (L3)           │
                                    │         Arbitrum Orbit · 46630          │
                                    └─────────────────────────────────────────┘

    ┌──────────────┐       ┌─────────────────────────────────────────────────────────────--─┐
    │  Yahoo       │       │                                                                │
    │  Finance     │       │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
    │  (Real       │ 30s   │   │ TSLA Oracle  │    │ AMZN Oracle  │    │ PLTR Oracle  │     │
    │  Stock       │──────>│   │  $273.45     │    │  $214.92     │    │  $109.51     │     │
    │  Prices)     │       │   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘     │
    └──────────────┘       │          │                   │                   │             │
                           │          └────────────┬──────┘────────────┬──────┘             │
    ┌──────────────┐       │                       │                    │                   │
    │  AI Stock    │       │                       ▼                    ▼                   │
    │  Advisor     │       │   ┌─────────────────────────────────────────────────────┐      │
    │  (OpenRouter │       │   │              StopLossVault                          │      │
    │  + Gemini)   │       │   │                                                     │      │
    └──────────────┘       │   │  User deposits TSLA ──► Vault holds tokens          │      │
                           │   │  Sets stop at $270  ──► Guaranteed exit price       │      │
                           │   │  Pays 2% premium   ──► Premium to insurance pool    │      │
                           │   │                                                     │      │
                           │   │  price <= stopPrice? ──► Execute! ──┐               │      │
                           │   └─────────────────────────────────────┼───────────────┘      │
                           │                                         │                      │
                           │              ┌──────────────────────────┼─────────-┐           │
                           │              │                          ▼          │           │
                           │              │                  GapInsurancePool   │           │
                           │              │                                     │           │
                           │              │  ┌─────────┐    ┌──────────────-┐   │           │
                           │              │  │  LPs    │    │  On Execute:  │   │           │
                           │              │  │ Deposit │    │               │   │           │
                           │              │  │  USDC   │    │ USDC ──► User │   │           │
                           │              │  │         │    │ (guaranteed   │   │           │
                           │              │  │ Earn 2% │    │  stop price)  │   │           │
                           │              │  │ premium │    │               │   │           │
                           │              │  │  yield  │    │ Stock ──► Pool│   │           │
                           │              │  └─────────┘    │ (buy the dip) │   │           │
                           │              │                 └─────-─────────┘   │           │
                           │              └────────────────────────────────────-┘           │
                           │                                                                │
                           │   ┌───────────────────┐  ┌───────────────────┐                 │
                           │   │  BasketFactory    │  │ PrivateStopLoss   │                 │
                           │   │                   │  │                   │                 │
                           │   │ KTECH = 40% TSLA  │  │ 1. Commit hash    │                 │
                           │   │   + 30% AMZN      │  │    (price hidden) │                 │
                           │   │   + 20% PLTR      │  │ 2. Reveal price   │                 │
                           │   │   + 10% AMD       │  │ 3. Execute        │                 │
                           │   │                   │  │                   │                 │
                           │   │ Mint ERC-20 basket│  │ Anti-MEV          │                 │
                           │   │ token in 1 tx     │  │ Anti-front-run    │                 │
                           │   └───────────────────┘  └───────────────────┘                 │
                           │                                                                │
                           │   ┌───────────────────┐  ┌───────────────────┐                 │
                           │   │ CoveredCallVault  │  │ BasketPriceOracle │                 │
                           │   │                   │  │                   │                 │
                           │   │ Deposit TSLA      │  │ Aggregates stock  │                 │ 
                           │   │ Set strike + exp  │  │ oracles into      │                 │
                           │   │ Earn premium      │  │ basket NAV        │                 │
                           │   │ Buyer gets upside │  │                   │                 │
                           │   │                   │  │ Portfolio-level   │                 │
                           │   │ First permissioned│  │ stop-losses on    │                 │
                           │   │ -less calls for   │  │ entire baskets    │                 │
                           │   │ tokenized stocks  │  │                   │                 │
                           │   └───────────────────┘  └─────────────────-─┘                 │
                           │                                                                │
                           └──────────────────────────────────────────────────────────────-─┘

                           ┌──────────────────────────────────────────────────────────────┐
                           │                      PRICE BOT                               │
                           │                                                              │
                           │  Every 30 seconds:                                           │
                           │  1. Fetch TSLA, AMZN, PLTR, NFLX, AMD from Yahoo Finance     │
                           │  2. Push prices to on-chain PriceOracle contracts            │
                           │  3. Check shouldTrigger() for all active stop-losses         │
                           │  4. Execute triggered positions automatically                │
                           │                                                              │
                           └──────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.26, Foundry, 134 passing tests across 6 test suites |
| Frontend | Next.js 16, wagmi v3, viem, TailwindCSS, Recharts |
| Price Bot | Node.js, ethers.js v6, Yahoo Finance real-time data |
| AI Advisor | OpenRouter + Google Gemini for basket composition suggestions |
| Chain | Robinhood Chain Testnet (Arbitrum Orbit L3, chain 46630) |

## Project Structure

```
stockforge/
  contracts/
    src/
      StopLossVault.sol          # Insurance-backed stop-loss vault
      GapInsurancePool.sol       # Two-sided insurance market
      BasketFactory.sol          # Permissionless stock index creation
      BasketToken.sol            # ERC-20 basket token
      PrivateStopLoss.sol        # Commit-reveal privacy stop-losses
      CoveredCallVault.sol       # Permissionless covered call options
      BasketPriceOracle.sol      # Basket NAV aggregator
      PriceOracle.sol            # Chainlink AggregatorV3 compatible
      MockUSDC.sol               # Testnet mintable USDC
    test/
      StopLossVault.t.sol        # 30 tests
      BasketFactory.t.sol        # 15 tests
      PrivateStopLoss.t.sol      # 27 tests
      CoveredCallVault.t.sol     # 29 tests
      BasketPriceOracle.t.sol    # 12 tests
      FHEStopLoss.t.sol          # 21 tests
    script/
      Deploy.s.sol               # Full deployment script
      DemoBasket.s.sol           # On-chain basket creation
  frontend/                      # Next.js 16 + wagmi + shadcn
  bot/
    index.js                     # Price updater + stop executor
```

## Running Locally

```bash
# Contracts
cd contracts && forge build && forge test

# Frontend
cd frontend && bun install && bun dev

# Price Bot
cd bot && cp .env.example .env && npm install && npm start
```

## FAQ

**Q: How is this different from a put option?**
Same economic outcome (guaranteed floor price), but simpler UX (one click, no expiry, no strike selection), and permissionless underwriting (anyone can be an LP).

**Q: How is this different from dYdX/GMX stop-losses?**
Those trade synthetic perps. StockFi protects actual tokenized stock tokens (TSLA ERC-20s on RH Chain) with a pre-funded insurance pool that absorbs price gaps.

**Q: What if the pool runs out?**
The pool has an 80% utilization cap. New stop-losses are rejected when over-utilized. LPs see pool health metrics on the insurance page.

**Q: Why Robinhood Chain?**
It's the first Arbitrum Orbit L3 with native tokenized stock tokens as ERC-20s. These tokens exist but have zero DeFi infrastructure. StockFi fills the entire gap.

---

Built from scratch in 48 hours. 8 contracts. 134 tests. 18 deployments. No mocks. Everything real.
