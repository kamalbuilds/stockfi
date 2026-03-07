# StockFi Architecture

## System Overview

StockFi is a guaranteed-price stop-loss protocol for tokenized stocks on Robinhood Chain (Arbitrum Orbit L3, chain 46630). It uses insurance-backed vaults to guarantee execution at the exact stop price, eliminating slippage and gap risk.

```
                                ROBINHOOD CHAIN (L3)
 +------------------------------------------------------------------+
 |                                                                    |
 |  +-----------------+     premium (USDC)    +-------------------+  |
 |  | StopLossVault   | ------------------->  | GapInsurancePool  |  |
 |  |                 |                       |                   |  |
 |  | - holds stock   |  USDC at guaranteed   | - LPs deposit     |  |
 |  |   tokens        | <---  price --------  |   USDC            |  |
 |  | - tracks stops  |                       | - earns premiums  |  |
 |  | - 30-day expiry |  stock tokens after   | - covers gaps     |  |
 |  | - exposure cap  | ---  execution ----->  | - 1-day lockup    |  |
 |  +-----------------+                       +-------------------+  |
 |         |                                          ^              |
 |         | reads price                              |              |
 |         v                                          |              |
 |  +-----------------+                               |              |
 |  | PriceOracle     |     +------------------+      |              |
 |  | (per stock)     | <-- | Price Bot        |      |              |
 |  | AggregatorV3    |     | Yahoo Finance    |      |              |
 |  +-----------------+     | every 30s        |      |              |
 |                          | executes stops   | -----+              |
 |                          +------------------+                     |
 |                                                                    |
 |  +-----------------+     +-------------------+                    |
 |  | BasketFactory   | --> | BasketToken (x N) |                    |
 |  | create/mint/burn|     | custom stock ETF  |                    |
 |  | permissionless  |     | ERC-20            |                    |
 |  +-----------------+     +-------------------+                    |
 |                                                                    |
 |  +-----------------+     +-------------------+                    |
 |  | CoveredCallVault|     | PrivateStopLoss   |                    |
 |  | write/buy/      |     | commit-reveal     |                    |
 |  | exercise calls  |     | MEV-resistant     |                    |
 |  +-----------------+     +-------------------+                    |
 +------------------------------------------------------------------+

         FRONTEND (Next.js 16)          BOT (Node.js)
  +----------------------------+   +--------------------+
  | wagmi v3 + viem            |   | ethers.js v6       |
  | TailwindCSS + shadcn/ui   |   | Yahoo Finance API  |
  | Pages:                     |   | Cron: 30s price    |
  |  - Dashboard               |   |   push + stop      |
  |  - Stop-Loss               |   |   execution        |
  |  - Baskets                 |   +--------------------+
  |  - Insurance Pool          |
  |  - Covered Calls           |
  |  - Analytics               |
  +----------------------------+
```

## Core Contracts

### StopLossVault.sol
The central vault where users deposit stock tokens and set guaranteed stop-loss prices.

**Flow:**
1. User deposits stock tokens + 2% USDC premium
2. Premium routed to GapInsurancePool
3. Bot monitors oracle prices every 30s
4. When price <= stopPrice, bot calls `executeStopLoss()`
5. User receives USDC at guaranteed price (minus 0.5% fee)
6. Insurance pool receives stock tokens (takes downside)

**Safety mechanisms:**
- 30-day position expiry (`MAX_POSITION_DURATION`)
- Active exposure tracking (`totalActiveExposure`)
- Pool capacity check before position creation (`hasCapacity()`)
- 2-minute execution cooldown (prevents bot retry loops)
- Oracle staleness check (1 hour max)
- Dust position prevention (minimum premium check)

### GapInsurancePool.sol
Two-sided market where LPs deposit USDC to back stop-loss guarantees.

**Share math:** Uses actual pool USDC balance for both deposit and withdrawal calculations. Share value = `(shares * poolBalance) / totalShares`.

**Safety mechanisms:**
- 1-day withdrawal delay (`WITHDRAWAL_DELAY`) prevents bank runs
- 80% utilization cap (`hasCapacity()`)
- Premium accounting via `recordPremium()`
- Gap tracking via `recordGapCovered()`

### PriceOracle.sol
Chainlink AggregatorV3-compatible price feed updated by the bot.

- 50% max price jump sanity check per update
- `forceUpdatePrice()` for initial seeding (owner only)
- 1-hour staleness window

### BasketFactory.sol + BasketToken.sol
Permissionless on-chain ETF creation. Users define custom stock portfolios as ERC-20 tokens.

- Weights in basis points (must sum to 10,000)
- Mint: deposit proportional stock tokens, receive basket tokens
- Burn: return basket tokens, receive underlying stocks pro-rata
- Price oracle integration for weighted basket pricing

### CoveredCallVault.sol
Permissionless covered call options for tokenized stocks.

- Writers deposit stock tokens, set strike/premium/expiry
- Buyers pay premium, get right to exercise at strike
- American-style (exercise anytime before expiry)
- 1-hour minimum, 30-day maximum duration
- 1% protocol fee on premiums

### PrivateStopLoss.sol
Commit-reveal scheme for MEV-resistant stop-losses. Users commit a hash of their stop price, then reveal when needed.

## Data Flow

### Stop-Loss Lifecycle
```
CREATE:   User -> StopLossVault.createStopLoss()
              -> stock tokens to vault
              -> USDC premium to GapInsurancePool
              -> pool.recordPremium()

MONITOR:  Bot reads PriceOracle.latestRoundData()
              -> vault.shouldTrigger(positionId)

EXECUTE:  Bot -> StopLossVault.executeStopLoss()
              -> USDC from pool to user (guaranteed price)
              -> USDC from pool to feeRecipient (0.5%)
              -> stock tokens from vault to pool
              -> pool.recordStockTokens()
              -> pool.recordGapCovered()

CANCEL:   User -> StopLossVault.cancelStopLoss()
              -> stock tokens returned to user
              -> premium NOT refunded

EXPIRE:   Anyone -> StopLossVault.expirePosition()
              -> stock tokens returned to owner
              -> after 30 days
```

### Insurance Pool Flow
```
DEPOSIT:  LP -> GapInsurancePool.deposit(USDC)
              -> receives shares proportional to pool value
              -> 1-day withdrawal lock starts

EARN:     Premiums flow in from stop-loss creation
              -> increases pool balance
              -> share value appreciates

PAYOUT:   Stop-loss executes
              -> pool pays guaranteed USDC to user
              -> pool receives stock tokens (may recover)

WITHDRAW: LP -> GapInsurancePool.withdraw(shares)
              -> must wait 1 day after deposit
              -> receives proportional USDC
```

## Fee Structure

| Fee | Amount | Recipient | When |
|-----|--------|-----------|------|
| Insurance premium | 2% of position value | GapInsurancePool LPs | Stop-loss creation |
| Execution fee | 0.5% of guaranteed payout | Protocol (feeRecipient) | Stop-loss execution |
| Covered call fee | 1% of option premium | Protocol (feeRecipient) | Option purchase |

## Security Model

- **Oracle trust:** Single bot pushes prices from Yahoo Finance. Production would use Chainlink data feeds.
- **Bot trust:** Bot can only execute stops when oracle price <= stopPrice. Cannot drain funds or manipulate execution.
- **Admin controls:** Owner can update bot address, fee recipient, and insurance pool. Cannot access user funds directly.
- **Pool solvency:** 80% utilization cap + active exposure tracking. Pool cannot be overcommitted beyond its reserves.
- **MEV protection:** PrivateStopLoss uses commit-reveal to hide stop prices from frontrunners.

## Deployment

All contracts deployed on Robinhood Chain Testnet (chain 46630, Arbitrum Orbit L3).

Build: `cd contracts && forge build`
Test: `cd contracts && forge test` (34 tests)
Deploy: `cd contracts && forge script script/Deploy.s.sol`
