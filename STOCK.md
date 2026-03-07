## PART 3 - HOW THEY WORK TOGETHER

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
  This is called a "collar strategy" institutions use it.
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
