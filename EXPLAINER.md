# StockFi - How Insurance Pool & Covered Calls Work

---

## PART 1 — INSURANCE POOL

Think of it like **car insurance, but for stock prices.**

```
THE PLAYERS:

  LPs (Insurance Providers)          Traders
  ──────────────────────────         ───────
  Have idle USDC                     Have TSLA tokens
  Want yield on it                   Want price protection
  Willing to take risk               Willing to pay premium
```

```
HOW MONEY FLOWS IN:

  Trader deposits TSLA + pays 2% premium
  ────────────────────────────────────────

  Trader ──── TSLA tokens ──────► StopLossVault  (holds your stock)
  Trader ──── $200 USDC   ──────► GapInsurancePool  (your 2% premium)
                                      ▲
  LP 1 ──── $5,000 USDC ──────────────┤
  LP 2 ──── $3,000 USDC ──────────────┤  (their capital backs the guarantees)
  LP 3 ──── $2,000 USDC ──────────────┘
```

```
SCENARIO A: Price never hits your stop  (most common)
────────────────────────────────────────────────────

  TSLA stays above $270 ──► stop never triggers

  Trader:  gets tokens back whenever they cancel 
  LPs:     keep the $200 premium as pure profit 
           (did nothing, earned yield)
```

```
SCENARIO B: Price crashes through your stop
────────────────────────────────────────────

  You set stop at $270
  TSLA gaps down to $248

                         $270 stop triggers
                               │
                               ▼
  GapInsurancePool ──── $270 USDC ────────────────► Trader 
                                                    (got guaranteed price)

  StopLossVault ──── TSLA tokens (worth $248) ────► Insurance Pool
                                                    (pool now holds stock
                                                     at a discount)

  Pool paid out $270 but got stock worth $248
  → Pool absorbed the $22/share gap
  → But pool now holds TSLA at $248 (a discount)
  → When TSLA recovers, pool sells and recoups ♻️
```

```
WHY LPs STILL PROFIT LONG-TERM:

  Premiums collected:  ████████████████  $10,000/month
  Gaps paid out:       ████              $3,000/month  (rare events)

  Net yield:           ████████████      $7,000/month

  + Pool holds discounted stock that recovers over time

  It's like being a casino — individual hands can lose,
  but the house wins consistently over thousands of bets.
```

---

## PART 2 — COVERED CALLS

Think of it like **renting out the upside of your stock.**

```
REAL WORLD ANALOGY:

  You own a house worth $500,000.
  You rent it to someone for $2,000/month.
  If they want to BUY it at $600,000 within 6 months, they can.
  If they don't exercise that right, you keep the rent.

  Your house    = TSLA tokens
  Monthly rent  = option premium
  Right to buy  = the "call option"
```

```
THE TWO SIDES:

  WRITER (you, the stock holder)     BUYER (wants exposure)
  ──────────────────────────────     ──────────────────────
  Already owns TSLA                  Doesn't own TSLA yet
  Thinks price won't moon soon       Thinks TSLA will moon
  Wants passive income               Wants leveraged upside
  Willing to sell at a fixed price   Only risks the premium
```

```
HOW IT WORKS STEP BY STEP:

  WRITER sets up the call:
  ─────────────────────────
  My TSLA tokens:    100
  Strike price:      $300   (I'll sell at this price if exercised)
  Premium:           $5 per token = $500 total
  Expiry:            30 days

  Writer ──── 100 TSLA ────► CoveredCallVault (locked as collateral)
  Buyer  ──── $500 USDC ───► Writer  (premium paid immediately)
```

```
OUTCOME A: TSLA never reaches $300  (expiry passes)
────────────────────────────────────────────────────

  TSLA price:  $270 ──────────────────────────── stays below $300
                                                        │
                                                   expiry hits
                                                        │
  Writer: ◄──── gets 100 TSLA back 
  Writer: already got $500 premium    (pure yield, free money)

  Buyer:  lost $500 premium ❌
          (small loss, better than buying full position)
```

```
OUTCOME B: TSLA rockets to $350  (buyer exercises)
────────────────────────────────────────────────────

  TSLA price:  $270 ────────────────────────────────► $350
                                                         │
                                              buyer exercises
                                                         │
  CoveredCallVault ──── 100 TSLA ──────────► Buyer
  Buyer pays:      ──── $300 x 100 ─────────► Writer

  Writer: sold at $300   (missed $350 upside, but got $500 premium too)
  Buyer:  paid $300/token for stock worth $350 = +$50/token profit 
          spent $500 premium, made $5,000 on the move = 10x return 🚀
```

---

## PART 3 — HOW THEY WORK TOGETHER

```
FULL PICTURE — one trader, all primitives combined:

  You have $50,000 of TSLA
  │
  ├── PUT 100 TSLA into StopLossVault
  │     Pay 2% = $1,000 premium ──────────────────► Insurance Pool LPs earn
  │     If TSLA crashes, you get $270 guaranteed
  │
  └── PUT remaining TSLA into CoveredCallVault
        Set strike $300, 30-day expiry
        Earn $500 premium immediately ◄────────────── Buyer pays you


  Net cost of protection:
  ────────────────────────
  Insurance premium paid:  -$1,000
  Call premium received:   +$500
  ─────────────────────────────────
  Net cost of insuring      -$500   (only 1% effective cost)
  your $50,000 position


  You're selling the ceiling to pay for the floor.
  This is called a "collar strategy" — institutions use it.
  On StockFi, anyone can do it. No broker. No approval.
```

```
THE BIG PICTURE — who benefits from what:

  ┌─────────────────┬──────────────────────────┬──────────────────┐
  │   WHO           │   WHAT THEY DO           │   WHAT THEY GET  │
  ├─────────────────┼──────────────────────────┼──────────────────┤
  │ Trader          │ Deposits stock + 2%      │ Guaranteed exit  │
  │                 │ premium                  │ price always     │
  ├─────────────────┼──────────────────────────┼──────────────────┤
  │ LP              │ Deposits USDC into pool  │ 2% premium yield │
  │                 │                          │ + discounted     │
  │                 │                          │ stock on gaps    │
  ├─────────────────┼──────────────────────────┼──────────────────┤
  │ Call Writer     │ Locks stock, sets strike │ Immediate USDC   │
  │                 │ + premium                │ premium income   │
  ├─────────────────┼──────────────────────────┼──────────────────┤
  │ Call Buyer      │ Pays small premium       │ Leveraged upside │
  │                 │                          │ with capped risk │
  └─────────────────┴──────────────────────────┴──────────────────┘
```
