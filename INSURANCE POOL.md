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