# StockFi — Pitch Deck

---

## SLIDE 1 — COVER

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│          ▲ StockFi                                  │
│                                                     │
│   The DeFi Composability Layer                      │
│   for Tokenized Stocks                              │
│                                                     │
│   6 primitives. 2 chains. 134 tests.                │
│   Live on Robinhood Chain.                          │
│                                                     │
│   stockfi.vercel.app                                │
└─────────────────────────────────────────────────────┘
```

---

## SLIDE 2 — THE PROBLEM

**Your stop-loss doesn't protect your price.**

```
TSLA price chart:

$300 ──────────────────────────┐
                               │  ← earnings miss
$270 ──── YOU SET STOP HERE    │
                               ↓ gap down
$248 ───────────────────────────── market opens here

         ❌ Your stop TRIGGERED at $248
         ❌ You ASKED for $270
         ❌ You LOST $22/share with no recourse
```

```
TradFi Problems:

  Markets close 16hrs/day  →  gaps happen at open
  Stop = market order      →  you get whatever price
  Put options exist BUT    →  need broker approval
                           →  have expiry dates
                           →  $250K min for ETFs
                           →  not for tokenized stocks
```

---

## SLIDE 3 — THE INSIGHT

```
                    DeFi never closes.

  TradFi                          DeFi
  ──────                          ────
  Mon 9:30am – Fri 4pm  VS  24 hours / 7 days / 365 days

  Gap risk is a TradFi problem.
  On-chain, we can pre-fund the guarantee.
```

**If markets never close → gaps can't happen → price guarantee is enforceable.**

---

## SLIDE 4 — WHAT IS STOCKFI

```
┌──────────────────────────────────────────────────────────────┐
│                        StockFi                               │
│          DeFi Primitives for Tokenized Equities              │
├────────────┬────────────┬────────────┬────────────┬──────────┤
│  Baskets   │  Stop-Loss │  Covered   │  Privacy   │Insurance │
│            │ (Insured)  │   Calls    │   Stops    │  Pool    │
├────────────┼────────────┼────────────┼────────────┼──────────┤
│  Build     │ Guaranteed │ Earn yield │ Hide your  │ LPs earn │
│  your own  │ exit price │ on idle    │ stop from  │ 2%       │
│  ETF in    │ every time │ stock      │ front-     │ premium  │
│  1 click   │            │ tokens     │ runners    │ yield    │
└────────────┴────────────┴────────────┴────────────┴──────────┘

      All permissionless. All composable. All on Robinhood Chain.
```

---

## SLIDE 5 — HOW GAP INSURANCE WORKS

```
STEP 1: You deposit TSLA + pay 2% premium

  You ──── TSLA tokens ────► StopLossVault
  You ──── 2% premium  ────► GapInsurancePool
                                    ▲
  LPs ──── USDC        ────────────┘


STEP 2: Price bot monitors 24/7

  Yahoo Finance ──► PriceOracle ──► Bot checks every 30s
                                         │
                                    price ≤ stop?
                                    YES ──► execute


STEP 3: Execution at guaranteed price

  GapInsurancePool ──── USDC at $270 ────► YOU  ✅
  StopLossVault    ──── TSLA tokens  ────► Pool
                                          (pool gets
                                           discounted
                                           stock, recovers
                                           when price bounces)
```

```
You set stop at $270
TSLA crashes to $248

  TradFi: you get $248   ❌  (-$22/share)
  StockFi: you get $270  ✅  (gap covered by pool)
```

---

## SLIDE 6 — COVERED CALLS (NEW PRIMITIVE)

```
WRITER (stock holder)                    BUYER
─────────────────────                    ──────

  Has 100 TSLA tokens                    Wants TSLA exposure
  Thinks price stays flat                with limited downside

       │                                      │
       │  deposit TSLA + set strike $300      │
       ▼                                      ▼
  ┌─────────────────────────────────────────────┐
  │              CoveredCallVault               │
  │                                             │
  │  Writer sets:  Strike = $300                │
  │                Premium = $5/token           │
  │                Expiry  = 30 days            │
  └─────────────────────────────────────────────┘
       │                                      │
       │◄── receives $500 USDC immediately    │
       │    (premium, keep no matter what)    │──► pays $500
                                              │    USDC

  OUTCOME A: TSLA stays < $300              OUTCOME B: TSLA → $350
  ─────────────────────────────             ──────────────────────
  Writer: gets tokens back + $500  ✅       Writer: sells at $300 ✅
  Buyer:  loses $500 premium       ❌       Buyer:  buys at $300,
                                            worth $350 → +$5000  ✅
```

**In TradFi: needs broker + options approval + T+2 settlement**
**On StockFi: 1 transaction. Permissionless. Instant.**

---

## SLIDE 7 — PRIVACY STOPS (TWO LAYERS)

```
The problem: your stop price is visible on-chain
             MEV bots hunt your stop. Front-runners exploit it.

LAYER 1 — Commit-Reveal (Robinhood Chain)
─────────────────────────────────────────

  Phase 1:  commit( hash(stopPrice, salt) )   ← price hidden
                │
                │  nobody knows your stop
                ▼
  Phase 2:  reveal( stopPrice, salt )         ← arms trigger
                │
                ▼
  Phase 3:  execute when triggered            ← same guaranteed payout


LAYER 2 — FHE Encryption (Arbitrum Sepolia via Fhenix)
───────────────────────────────────────────────────────

  stopPrice encrypted as euint128
                │
                ▼
  FHE.lte( currentPrice_encrypted, stopPrice_encrypted )
                │
                │  comparison happens on ENCRYPTED values
                │  MEV bots see: 0x3f8a... (meaningless)
                ▼
  trigger fires or not — price NEVER revealed
```

---

## SLIDE 8 — BASKET FACTORY

```
TradFi ETF                              StockFi Basket
──────────                              ──────────────
$250,000+ legal fees                    $0
SEC approval (6-18 months)             1 transaction
Minimum AUM requirements               Any amount
Institutional access only              Anyone, anywhere


  CREATE "KTECH" BASKET
  ─────────────────────
  40% ████████ TSLA
  30% ██████   AMZN          ──► KTECH ERC-20 token
  20% ████     PLTR               (represents your index)
  10% ██       AMD

  Deposit proportional tokens → receive KTECH
  Burn KTECH anytime          → redeem proportional tokens

  THEN: set a stop-loss on KTECH itself
        using BasketPriceOracle (AggregatorV3 compatible)
        → portfolio-level insurance. One premium. Total protection.
```

---

## SLIDE 9 — ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                    ROBINHOOD CHAIN (L3, chain 46630)            │
│                                                                 │
│  Stock Tokens: TSLA · AMZN · PLTR · NFLX · AMD  (ERC-20)      │
│                        │                                        │
│        ┌───────────────┼──────────────────────────┐            │
│        ▼               ▼                          ▼            │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐        │
│  │ Basket   │  │ StopLoss     │  │ CoveredCall       │        │
│  │ Factory  │  │ Vault        │  │ Vault             │        │
│  └──────────┘  └──────┬───────┘  └───────────────────┘        │
│        │              │                                         │
│        ▼              ▼                                         │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐        │
│  │ Basket   │  │ GapInsurance │  │ PrivateStopLoss   │        │
│  │ Price    │  │ Pool         │  │ (commit-reveal)   │        │
│  │ Oracle   │  └──────────────┘  └───────────────────┘        │
│  └──────────┘         ▲                                        │
│                       │ prices every 30s                       │
│                  Price Bot                                      │
│                  (Yahoo Finance)                                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                 ARBITRUM SEPOLIA (chain 421614)                 │
│                                                                 │
│  ┌────────────────────────────────────────────┐                │
│  │ FHEStopLoss (Fhenix CoFHE)                 │                │
│  │ encrypted stop prices via euint128         │                │
│  │ FHE.lte() — comparison on ciphertext       │                │
│  └────────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

---

## SLIDE 10 — COMPOSABILITY STORY

```
START: You have $50,000 in tech stocks

  STEP 1 ─── Create Basket ──────────────────────────────────────
              KTECH = 40% TSLA + 30% AMZN + 20% PLTR + 10% AMD
              Deposit tokens → receive KTECH ERC-20
                                    │
  STEP 2 ─── Insure Portfolio ──────┘
              Set stop-loss on KTECH at $45,000
              Pay 2% = $1,000 premium
              Insurance pool pre-funds your $45,000 guarantee
                                    │
  STEP 3 ─── Earn Yield ───────────┘
              Write covered calls on your idle TSLA
              Earn $500 USDC premium/month
              (offsetting your insurance cost)
                                    │
  STEP 4 ─── Hide Strategy ────────┘
              Commit-reveal on your stop price
              MEV bots can't see your $45,000 target

  RESULT: Protected portfolio. Generating yield. Private strategy.
          All on-chain. No broker. No approval. No expiry.
```

---

## SLIDE 11 — LIVE ON-CHAIN PROOF

```
  Robinhood Chain Testnet (chain 46630)
  ──────────────────────────────────────

  StopLossVault     0xc1dC88DDA382D20...  ✅ deployed
  GapInsurancePool  0xaC7681429000c6...   ✅ deployed
  BasketFactory     0x1A208C7A48C610...   ✅ deployed
  PrivateStopLoss   0x758bbd638CdE40...   ✅ deployed
  CoveredCallVault  0x4369b5e5866C70...   ✅ deployed
  BasketPriceOracle 0xe7C6578465F29b...   ✅ deployed
  Oracles x5        TSLA AMZN PLTR        ✅ live prices
                    NFLX AMD

  Arbitrum Sepolia (chain 421614)
  ────────────────────────────────
  FHEStopLoss       0x95B4b7d7a23d95...  ✅ deployed

  ┌────────────────────────────────────┐
  │  E2E Verified on-chain:            │
  │                                    │
  │  Created AMZN stop at $200         │
  │  Oracle pushed to $195             │
  │  shouldTrigger() → true            │
  │  executeStopLoss() → USDC @ $200   │
  │  Gap covered by pool               │
  └────────────────────────────────────┘

  134 / 134 tests passing
```

---

## SLIDE 12 — MARKET OPPORTUNITY

```
  Tokenized RWA Market
  ─────────────────────
  2024: $12B ──────────────────────────────────── now
  2030: $16T ──────────────────────────────────── projected
                                        (BCG estimate)

  Robinhood Chain is the first L3 built for
  tokenized equities at consumer scale.

  Every Robinhood user eventually needs:
  ┌──────────────────────────────────────────┐
  │  Downside protection    → StopLossVault  │
  │  Index exposure         → BasketFactory  │
  │  Yield on holdings      → CoveredCalls   │
  │  Trading privacy        → PrivateStop    │
  │  Portfolio insurance    → BasketOracle   │
  │  LP yield               → InsurancePool  │
  └──────────────────────────────────────────┘

  StockFi is the infrastructure layer.
  Not a product. A platform.
```

---

## SLIDE 13 — WHY NOW / WHY ROBINHOOD CHAIN

```
  Robinhood Chain launched 2025.

  Tokenized stocks exist as ERC-20s.
  But the DeFi stack for them is EMPTY.

  No DEX primitives for stocks
  No insurance products            ← StockFi fills this
  No options market
  No privacy layer
  No index/basket products

  We are the Bloomberg Terminal of
  Robinhood Chain. First mover. No competition.

  ┌─────────────────────────────────────┐
  │  "You can't build this in TradFi.  │
  │   DeFi is the only place where     │
  │   markets never close and smart    │
  │   contracts enforce pre-committed  │
  │   execution."                      │
  └─────────────────────────────────────┘
```

---

## SLIDE 14 — TECH STACK

```
  ┌──────────────────────────────────────────────┐
  │  CONTRACTS                                   │
  │  Solidity 0.8.26 · Foundry · 134 tests       │
  │  8 contracts on RH Chain                     │
  │  1 contract on Arb Sepolia (FHE)             │
  ├──────────────────────────────────────────────┤
  │  PRIVACY                                     │
  │  Commit-reveal (RH Chain)                    │
  │  Fhenix CoFHE — euint128 encrypted stops     │
  │  FHE.lte() comparison on ciphertext          │
  ├──────────────────────────────────────────────┤
  │  FRONTEND                                    │
  │  Next.js 16 · wagmi v3 · viem               │
  │  TailwindCSS · shadcn/ui                     │
  │  11 routes · multi-chain switcher            │
  ├──────────────────────────────────────────────┤
  │  PRICE BOT                                   │
  │  Node.js · ethers.js v6                      │
  │  Yahoo Finance real-time prices              │
  │  Pushes every 30s · executes triggers        │
  └──────────────────────────────────────────────┘

  stockfi.vercel.app  |  github.com/kamalbuilds/stockfi
```

---

## SLIDE 15 — CTA / CLOSE

```
  ┌─────────────────────────────────────────────────────┐
  │                                                     │
  │   Goldman Sachs can't build this.                   │
  │   Robinhood can't build this.                       │
  │                                                     │
  │   We just did.                                      │
  │                                                     │
  │   StockFi — Gap-Proof Stop-Loss                     │
  │   for Tokenized Stocks                              │
  │                                                     │
  │   ✅  134/134 tests                                 │
  │   ✅  18 contracts deployed                         │
  │   ✅  E2E verified on-chain                         │
  │   ✅  Live: stockfi.vercel.app                      │
  │                                                     │
  │   Built at Arbitrum Open House NYC                  │
  │   March 6-8, 2026                                   │
  │                                                     │
  └─────────────────────────────────────────────────────┘
```
