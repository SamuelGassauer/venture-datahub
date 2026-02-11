import { NextRequest } from "next/server";
import { enrichInvestor } from "@/lib/investor-enricher";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { investorName } = await request.json();

    if (!investorName || typeof investorName !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing investorName" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          await enrichInvestor(investorName, (progress) => {
            const data = `data: ${JSON.stringify(progress)}\n\n`;
            controller.enqueue(encoder.encode(data));
          });
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Enrichment failed";
          const data = `data: ${JSON.stringify({ stage: "error", message: msg })}\n\n`;
          controller.enqueue(encoder.encode(data));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid request" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}
