## PART 2 - COVERED CALLS

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