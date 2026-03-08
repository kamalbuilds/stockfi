# StockFi - HackQuest Submission

## Tagline

"Stop-losses that actually stop your loss."

---

## Description

StockFi is the DeFi composability layer for tokenized stocks on Robinhood Chain.

In traditional finance, a stop-loss at $270 fills at $250 when markets gap overnight. You lose $20/share you thought you were protected from. On StockFi, you get exactly $270. A pre-funded insurance pool absorbs the gap. This is only possible because DeFi markets never close and smart contracts enforce pre-committed execution.

Robinhood Chain has tokenized stocks (TSLA, AMZN, PLTR, NFLX, AMD) as ERC-20s but zero native financial infrastructure. StockFi adds six composable primitives:

### The Problem

Stop-loss orders don't protect your price. They become market orders after trigger. You set $270, you get $250 in a fast-moving market. Put options solve this but require options knowledge, have expiry dates, and aren't available for tokenized stock tokens.

Robinhood Chain has tokenized stocks (TSLA, AMZN, PLTR, NFLX, AMD) as ERC-20s, but no native downside protection primitives.

### The Solution

**1. Insurance-Backed Stop-Losses** - Pay 2% premium, get a price-guaranteed exit. Unlike dYdX/GMX stops that execute at market price, StockFi pays your exact stop price. The Gap Insurance Pool absorbs the difference.

**2. Permissionless Stock Baskets** - Create custom stock indexes in one transaction. KTECH = 40% TSLA + 30% AMZN + 20% PLTR + 10% AMD. In TradFi, creating an ETF costs $250K+ and requires SEC approval. On StockFi: one click.

**3. Two-Sided Insurance Market** - LPs deposit USDC, earn 2% premiums from every stop-loss created, and receive discounted stock tokens when gaps occur. A built-in buy-the-dip strategy with yield.

**4. Covered Call Options** - First permissionless covered call market for tokenized stocks. Writers deposit tokens and earn premium. Buyers get leveraged upside. In TradFi this requires options approval and a broker. Here: one transaction.

**5. Privacy Stop-Losses (Commit-Reveal)** - Hide your stop price on-chain using hash(stopPrice, salt). No front-running. No stop hunting. Reveal only when ready to execute.

**6. Portfolio-Level Basket Insurance** - Insure your entire basket with one premium instead of individual stocks. Create a tech basket, set a stop-loss on the whole thing. This doesn't exist anywhere in DeFi or TradFi.

These six primitives compose together: Create a basket (2). Set a portfolio stop-loss (1+6). Earn yield on idle tokens (4). Hide your strategy (5). Insurance providers earn yield (3). One platform, six primitives, infinite combinations.

---

## Progress During Hackathon

Everything was built from scratch during the Arbitrum Open House NYC (March 6-8, 2026):

- Smart Contracts: 8 Solidity contracts (StopLossVault, GapInsurancePool, BasketFactory, BasketToken, CoveredCallVault, PrivateStopLoss, BasketPriceOracle, PriceOracle) with 134 passing tests across 6 test suites
- Deployments: 18+ contracts deployed and verified on Robinhood Chain Testnet (chain 46630)
- Frontend: Full Next.js 16 app with 18 routes, wagmi v3, live oracle price feeds, AI-powered stock advisor (OpenRouter), interactive basket creation, and real-time performance charts
- Price Bot: Node.js bot that fetches real stock prices from Yahoo Finance every 30 seconds and pushes them to on-chain oracle contracts
- E2E Verification: Complete flow verified on-chain (create stop-loss, push price below trigger, execute, verify USDC payout at guaranteed price, confirm insurance pool covered the gap)
- On-chain Baskets: 3 pre-made stock index baskets (KTECH, STREAMING, CHIPS&AI) created on-chain via BasketFactory
- AI Integration: OpenRouter-powered AI stock advisor that suggests basket compositions based on natural language queries

---

## Fundraising Status

Not fundraised. Looking for mentorship and ecosystem support to take StockFi from testnet to mainnet on Robinhood Chain.

---

## Last Hackathon

Arbitrum Open House NYC Founder House (March 6-8, 2026)

---

## Deployment Details

### Ecosystem Deployed

Robinhood Chain (Arbitrum Orbit L3, chain 46630)

### Testnet/Mainnet

Testnet

### Contract Addresses & Deployed Links

| Contract | Address | Explorer |
|----------|---------|----------|
| StopLossVault | `0xc1dC88DDA382D20e6F2f3F832CE941eE0369c788` | [View](https://explorer.testnet.chain.robinhood.com/address/0xc1dC88DDA382D20e6F2f3F832CE941eE0369c788) |
| GapInsurancePool | `0xaC7681429000c66657a4c8e042f8A0C4a5f9C040` | [View](https://explorer.testnet.chain.robinhood.com/address/0xaC7681429000c66657a4c8e042f8A0C4a5f9C040) |
| BasketFactory | `0x1A208C7A48C6102ABB61912d162aF8f7D1210856` | [View](https://explorer.testnet.chain.robinhood.com/address/0x1A208C7A48C6102ABB61912d162aF8f7D1210856) |
| CoveredCallVault | `0x4369b5e5866C705f123EAA6a8f22dA6E03D92395` | [View](https://explorer.testnet.chain.robinhood.com/address/0x4369b5e5866C705f123EAA6a8f22dA6E03D92395) |
| PrivateStopLoss | `0x758bbd638CdE4094F61c51f43D4A238b08675E70` | [View](https://explorer.testnet.chain.robinhood.com/address/0x758bbd638CdE4094F61c51f43D4A238b08675E70) |
| BasketPriceOracle | `0xe7C6578465F29b9820f57937eAc9B6E3f932609c` | [View](https://explorer.testnet.chain.robinhood.com/address/0xe7C6578465F29b9820f57937eAc9B6E3f932609c) |
| MockUSDC | `0xb3485Da6BB50843a20F321653869556Dc1E2F3c2` | [View](https://explorer.testnet.chain.robinhood.com/address/0xb3485Da6BB50843a20F321653869556Dc1E2F3c2) |
| TSLA Oracle | `0x3f7FC08150709C22F1741A230351B59c36bCCc8a` | [View](https://explorer.testnet.chain.robinhood.com/address/0x3f7FC08150709C22F1741A230351B59c36bCCc8a) |
| AMZN Oracle | `0x2636Ed9F3Aa33589810BE07B48ad9Be79de3Fd7F` | [View](https://explorer.testnet.chain.robinhood.com/address/0x2636Ed9F3Aa33589810BE07B48ad9Be79de3Fd7F) |
| PLTR Oracle | `0xcd8D3bFb6757504896a9320Dcb451e20d4baa74B` | [View](https://explorer.testnet.chain.robinhood.com/address/0xcd8D3bFb6757504896a9320Dcb451e20d4baa74B) |
| NFLX Oracle | `0x95B4b7d7a23d954BF92FeDF2e00A374E22208D69` | [View](https://explorer.testnet.chain.robinhood.com/address/0x95B4b7d7a23d954BF92FeDF2e00A374E22208D69) |
| AMD Oracle | `0xafA4230B7154d95F1c8Bc13AD443b2e50bde7C57` | [View](https://explorer.testnet.chain.robinhood.com/address/0xafA4230B7154d95F1c8Bc13AD443b2e50bde7C57) |

### Live Demo

https://stockfi.vercel.app

### GitHub

https://github.com/kamalbuilds/stockfi
