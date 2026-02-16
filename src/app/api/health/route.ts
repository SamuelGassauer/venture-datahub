import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

let lastCheck: { ok: boolean; latencyMs: number; error: string | null; checkedAt: string } | null = null;
let errorCount = 0;
let lastErrorAt: string | null = null;
let lastErrorMessage: string | null = null;

export async function GET() {
  // Return cached result if checked within last 30 seconds
  if (lastCheck && Date.now() - new Date(lastCheck.checkedAt).getTime() < 30_000) {
    return NextResponse.json({
      ...lastCheck,
      errorCount,
      lastErrorAt,
      lastErrorMessage,
    });
  }

  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  if (!hasKey) {
    const result = {
      ok: false,
      latencyMs: 0,
      error: "ANTHROPIC_API_KEY not set",
      checkedAt: new Date().toISOString(),
      errorCount,
      lastErrorAt,
      lastErrorMessage,
    };
    lastCheck = result;
    return NextResponse.json(result);
  }

  const start = Date.now();
  try {
    const client = new Anthropic();
    await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    const latencyMs = Date.now() - start;
    lastCheck = {
      ok: true,
      latencyMs,
      error: null,
      checkedAt: new Date().toISOString(),
    };
    return NextResponse.json({
      ...lastCheck,
      errorCount,
      lastErrorAt,
      lastErrorMessage,
    });
  } catch (e) {
    const latencyMs = Date.now() - start;
    const errorMsg = e instanceof Error ? e.message : "Unknown error";
    const isOverloaded = errorMsg.includes("overloaded") || errorMsg.includes("529");
    const isRateLimit = errorMsg.includes("rate") || errorMsg.includes("429");
    errorCount++;
    lastErrorAt = new Date().toISOString();
    lastErrorMessage = isOverloaded ? "API overloaded (529)" : isRateLimit ? "Rate limited (429)" : errorMsg;
    lastCheck = {
      ok: false,
      latencyMs,
      error: lastErrorMessage,
      checkedAt: new Date().toISOString(),
    };
    return NextResponse.json({
      ...lastCheck,
      errorCount,
      lastErrorAt,
      lastErrorMessage,
    });
  }
}

// POST to report errors from client-side enrichment flows
export async function POST(request: Request) {
  try {
    const { error } = await request.json();
    if (error) {
      errorCount++;
      lastErrorAt = new Date().toISOString();
      lastErrorMessage = typeof error === "string" ? error.substring(0, 200) : "Unknown error";
    }
    return NextResponse.json({ recorded: true, errorCount });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
