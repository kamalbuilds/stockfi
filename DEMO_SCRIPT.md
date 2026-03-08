# StockFi Demo Video Script (~3 minutes)

**[VISUAL: Open stockfi.vercel.app landing page]**

"Hey, I'm Kamal. This is StockFi, the DeFi composability layer for tokenized stocks on Robinhood Chain."

"Here's the problem. Robinhood Chain has real stock tokens, TSLA, AMZN, PLTR, NFLX, AMD, all as ERC-20s. But there's zero DeFi infrastructure around them. No stop-losses, no index products, no options, no insurance. You can hold TSLA on-chain but you can't do anything useful with it. StockFi fixes that."

---

## STOP-LOSS DEMO (0:25 - 1:10)

**[VISUAL: Click "Stop-Loss" in navbar, show the create stop-loss page]**

"Let's start with the core feature. Insurance-backed stop-losses."

"In traditional finance, you set a stop-loss at 270 dollars on TSLA. The stock gaps overnight, opens at 250. Your stop fills at 250. You just lost 20 dollars per share. That's called slippage and it happens every single day."

"On StockFi, you deposit your TSLA tokens, set your stop price, and pay a 2 percent premium. That premium goes into the Gap Insurance Pool. When TSLA drops below your stop price, the smart contract pays you USDC at your exact guaranteed price. Not the market price. Your price. The insurance pool absorbs the gap."

**[VISUAL: Show the dashboard with active stop-loss positions, price distance indicators]**

"Here's the dashboard. You can see active positions with live oracle prices updating every 30 seconds. The color coding shows how close the current price is to your stop. Green means safe. Yellow means getting close. Red means danger zone."

**[VISUAL: Click on Insurance page briefly]**

"And on the other side, liquidity providers deposit USDC into the insurance pool and earn premiums. It's a two-sided market. Users get guaranteed execution, LPs earn yield from underwriting risk."

---

## BASKETS DEMO (1:10 - 1:50)

**[VISUAL: Click "Baskets" in navbar]**

"Next feature. Permissionless stock index baskets. Think of these as on-chain ETFs without the SEC."

"We have three pre-made baskets deployed on-chain right now via our BasketFactory contract. KTECH is 40 percent TSLA, 30 AMZN, 20 PLTR, 10 AMD. STREAMING is Netflix-heavy. CHIPS AND AI is AMD and PLTR focused."

**[VISUAL: Show basket detail with composition chart, live prices]**

"Each basket is a real ERC-20 token. You can see live performance powered by our on-chain price oracles. And the best part, you can protect an entire basket with a single stop-loss. One click, one premium, all stocks in the basket are protected."

**[VISUAL: Show Create Basket page briefly]**

"Anyone can create a custom basket. Pick your stocks, set the weights, deploy. Your own personalized index fund, fully on-chain."

---

## AI ADVISOR + PRIVACY (1:50 - 2:20)

**[VISUAL: Click "AI Advisor" in navbar]**

"We also built an AI stock advisor powered by OpenRouter. Ask it something like 'build me a tech-heavy basket' and it suggests allocations based on current market conditions. It's like having a robo-advisor but fully integrated into the protocol."

**[VISUAL: Show the More dropdown, click "Private Stop-Loss"]**

"And for privacy, we have commit-reveal stop-losses. Your stop price is hidden by a hash on-chain until you reveal it. This prevents front-runners and MEV bots from hunting your stops. The smart contract uses a commit phase and a reveal phase. Your stop price is never visible until execution."

---

## TECHNICAL (2:20 - 2:50)

**[VISUAL: Show terminal with forge test output, or show explorer with deployed contracts]**

"Under the hood. 8 Solidity contracts. 134 passing tests across 6 test suites. 18 contracts deployed and verified on Robinhood Chain Testnet. A Node.js price bot fetching real stock prices from Yahoo Finance every 30 seconds and pushing them to on-chain oracle contracts."

"The entire end-to-end flow is verified on-chain. Create a stop-loss, price drops below trigger, bot executes, user receives USDC at the guaranteed price, insurance pool covers the gap. All real. No mocks."

**[VISUAL: Show explorer with a contract or two]**

"Everything is live on Robinhood Chain, which is an Arbitrum Orbit L3. Chain ID 46630. You can verify every contract on the explorer right now."

---

## CLOSE (2:50 - 3:00)

**[VISUAL: Back to landing page]**

"StockFi. Six financial primitives for tokenized stocks. Guaranteed stop-losses. Permissionless baskets. Two-sided insurance. Covered calls. Privacy stops. AI advisory. All built from scratch in 48 hours at Arbitrum Open House NYC."

"Thanks for watching."

---

# PITCH SUMMARY (for submission form / elevator pitch)

**One-liner:**
StockFi is the DeFi composability layer for tokenized stocks on Robinhood Chain, providing insurance-backed stop-losses that guarantee your exact exit price, something impossible in traditional finance.

**Two-liner:**
Robinhood Chain has real stock tokens (TSLA, AMZN, PLTR, NFLX, AMD) but zero DeFi infrastructure. StockFi adds six financial primitives: guaranteed stop-losses backed by an insurance pool, permissionless stock index baskets (on-chain ETFs), covered call options, commit-reveal privacy stops, portfolio-level protection, and a two-sided insurance market where LPs earn yield by underwriting risk.

**Why it matters (for judges):**
In TradFi, a stop-loss at $270 fills at $250 when markets gap. You lose $20/share. On StockFi, you get exactly $270. A pre-funded insurance pool absorbs the gap. This is only possible because DeFi markets never close and smart contracts enforce pre-committed execution. Goldman Sachs can't build this. We just did, in 48 hours.

---

# RECORDING TIPS

- Record at stockfi.vercel.app (live deployment)
- Increase browser zoom to 125% so text is readable
- Have the price bot running so oracle prices are fresh
- Practice the stop-loss explanation once before recording, it's the money shot
- Show real contract addresses on the explorer for credibility
- Keep energy up but conversational, not salesy
- Target 3 minutes, judges appreciate concise demos
