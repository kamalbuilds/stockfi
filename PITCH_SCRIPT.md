# StockFi Pitch Script (~2:30)

## SLIDE 1: Title (0:00 - 0:10)

**[SLIDE: StockFi logo + "ETFs without the SEC. Stop-losses without the gaps." + stockfi.vercel.app]**

"Hey, I'm Kamal. I'm going to show you why the $40 trillion stock market is about to get rebuilt on-chain, and why Robinhood Chain is where it starts."

---

## SLIDE 2: The Problem (0:10 - 0:35)

**[SLIDE: "The Gap Problem" - show a stock chart with an overnight gap down, $270 stop -> $250 fill]**

"Here's something every stock trader knows but nobody talks about. You own Tesla at 300 dollars. You set a stop-loss at 270. Responsible, right? Then Tesla reports bad earnings after hours. The stock gaps down and opens at 250. Your stop-loss triggers, but it fills at 250, not 270. You just lost 20 dollars per share that you thought you were protected from."

"This happens because traditional markets close at 4 PM. Overnight, anything can happen. When markets reopen, your stop-loss becomes a market order at whatever the price is. Your 'protection' had a gap."

---

## SLIDE 3: Why Now (0:35 - 0:55)

**[SLIDE: Robinhood Chain logo + TSLA, AMZN, PLTR, NFLX, AMD as ERC-20 tokens]**

"Robinhood Chain just launched as an Arbitrum Orbit L3 with real tokenized stock tokens. Tesla, Amazon, Palantir, Netflix, AMD, all as ERC-20s. But right now, these tokens just sit there. There's no DeFi infrastructure around them. No stop-losses, no index products, no options, no insurance. It's a blank canvas."

"StockFi is the financial infrastructure layer that makes these tokens actually useful."

---

## SLIDE 4: The Solution (0:55 - 1:25)

**[SLIDE: 6 financial primitives as icons/cards]**

"We built six financial primitives that don't exist anywhere else."

"Number one: Insurance-backed stop-losses. You set a stop at 270, you GET 270. Not 250. A pre-funded insurance pool absorbs the gap. This works because DeFi markets never close and smart contracts enforce pre-committed execution."

"Number two: Permissionless stock baskets. Create a custom index fund in one click. We have three live on-chain right now: KTECH, STREAMING, and CHIPS AND AI. Each is a real ERC-20 token."

"Number three: A two-sided insurance market. LPs deposit USDC and earn premiums from every stop-loss created. Users get protection, LPs get yield. Everyone wins."

"Plus: covered call options for yield on idle tokens, commit-reveal privacy stops to prevent front-running, and portfolio-level basket protection."

---

## SLIDE 5: How It Works (1:25 - 1:50)

**[SLIDE: Architecture diagram - User -> StopLossVault -> GapInsurancePool, PriceOracle feeding prices]**

"Under the hood, it's clean. User deposits stock tokens and pays a 2 percent premium. The premium flows to the Gap Insurance Pool where LPs have deposited USDC. Our price bot pushes real Yahoo Finance stock prices to on-chain oracle contracts every 30 seconds. When the price drops below your stop, a bot calls executeStopLoss. The contract pays you USDC at your exact guaranteed price. The insurance pool receives the stock tokens and absorbs any gap."

"No reliance on market makers. No order books. Pure smart contract execution with pre-funded insurance."

---

## SLIDE 6: Traction / What We Built (1:50 - 2:10)

**[SLIDE: Key numbers - 8 contracts, 134 tests, 18 deployments, live frontend, 3 on-chain baskets]**

"Everything was built from scratch in 48 hours at Arbitrum Open House NYC."

"8 Solidity contracts. 134 passing tests across 6 test suites. 18 contracts deployed and verified on Robinhood Chain Testnet. A live Next.js frontend at stockfi.vercel.app with real oracle prices. A price bot feeding Yahoo Finance data to on-chain oracles every 30 seconds. An AI advisor that helps users compose baskets through natural language."

"And most importantly, the end-to-end flow is fully verified on-chain. We created a stop-loss, pushed the price below the trigger, executed it, and confirmed the user received USDC at the guaranteed price while the insurance pool covered the gap. No mocks. Everything real."

---

## SLIDE 7: Why This Wins (2:10 - 2:25)

**[SLIDE: "Impossible in TradFi" - Goldman can't build this]**

"A guaranteed stop-loss is impossible in traditional finance. Markets close. Orders fill at market. Brokers have no pre-funded insurance. This only works because blockchain markets are 24/7 and smart contracts can enforce pre-committed execution with locked collateral."

"Goldman Sachs can't build this. Robinhood the app can't build this. It requires DeFi. And now that Robinhood Chain has stock tokens, we're the first to actually build it."

---

## SLIDE 8: Close (2:25 - 2:30)

**[SLIDE: stockfi.vercel.app + GitHub link + "Built at Arbitrum Open House NYC"]**

"StockFi. The Bloomberg Terminal of on-chain stocks. Live on Robinhood Chain Testnet."

"Thank you."

---

# QUICK REFERENCE: Key Lines to Nail

- "Your stop at 270 fills at 250. You lose 20 dollars per share you thought you were protected from."
- "A pre-funded insurance pool absorbs the gap."
- "Goldman Sachs can't build this. It requires DeFi."
- "8 contracts. 134 tests. 48 hours. Everything real."