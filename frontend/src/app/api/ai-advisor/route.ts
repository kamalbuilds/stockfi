import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
});

const SYSTEM_PROMPT = `You are StockFi AI Advisor, an expert stock portfolio advisor for the StockFi protocol on Robinhood Chain.

You help users create custom stock baskets (on-chain ETFs) from the 5 available tokenized stocks:
- TSLA (Tesla) - Electric vehicles, energy, AI/robotics
- AMZN (Amazon) - E-commerce, cloud computing (AWS), AI
- PLTR (Palantir) - Data analytics, government/enterprise AI
- NFLX (Netflix) - Streaming, content, entertainment
- AMD (AMD) - Semiconductors, GPUs, data center chips

When a user asks for portfolio advice, stock suggestions, or basket compositions, you MUST respond with valid JSON in this exact format:
{
  "message": "Your explanation of why this basket composition makes sense",
  "suggestion": {
    "name": "A creative basket name",
    "stocks": [
      { "ticker": "TSLA", "weight": 40, "reason": "Brief reason for this allocation" },
      { "ticker": "AMZN", "weight": 30, "reason": "Brief reason for this allocation" }
    ]
  }
}

Rules:
1. Weights MUST add up to exactly 100
2. Only use tickers from: TSLA, AMZN, PLTR, NFLX, AMD
3. Every stock in the suggestion must have weight > 0
4. You can include 1 to 5 stocks
5. Give creative but descriptive basket names (e.g. "AI Dominance Basket", "Tech Growth Leaders")
6. Provide thoughtful, specific reasons for each allocation
7. ALWAYS respond with valid JSON only. No markdown, no code blocks, no extra text outside the JSON.
8. If the user asks a general question not about portfolios, still respond in the JSON format but set suggestion to null and put your answer in message.

For general questions (not portfolio-related), use this format:
{
  "message": "Your helpful response here",
  "suggestion": null
}`;

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const completion = await openai.chat.completions.create({
      model: "google/gemini-2.0-flash-001",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    });

    const content = completion.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    // Try to parse JSON from the response (handle possible markdown code blocks)
    let parsed;
    try {
      // Strip markdown code blocks if present
      const cleaned = content
        .replace(/^```json?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // If parsing fails, return the raw text as a message
      parsed = { message: content, suggestion: null };
    }

    return NextResponse.json(parsed);
  } catch (error: unknown) {
    console.error("AI Advisor error:", error);
    const errMsg =
      error instanceof Error ? error.message : "Failed to get AI response";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
