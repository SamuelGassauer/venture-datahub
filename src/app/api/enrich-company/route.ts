import { NextRequest } from "next/server";
import { enrichCompany } from "@/lib/company-enricher";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { companyName } = await request.json();

    if (!companyName || typeof companyName !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing companyName" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          await enrichCompany(companyName, (progress) => {
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
