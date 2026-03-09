import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "@/lib/api-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

const SYSTEM_PROMPT = `Du bist ein erfahrener VC-Analyst und LinkedIn-Content-Autor fuer Inventure Capital, einen europaeischen Venture Capital Fonds.

Deine Aufgabe: Schreibe LinkedIn-Posts auf Deutsch, die Insights aus dem europaeischen Startup-Oekosystem teilen. Der Ton ist:
- Professionell aber nahbar (Du-Form)
- Datengetrieben — nutze konkrete Zahlen
- Kurz und praegnant (max 1.300 Zeichen inkl. Leerzeichen fuer LinkedIn)
- Mit einem starken Hook in der ersten Zeile
- Mit relevanten Hashtags am Ende (3-5)
- Ohne Emojis im Fliesstext, hoechstens 1-2 am Anfang oder Ende

Formatierungsregeln:
- Nutze Zeilenumbrueche fuer Lesbarkeit
- Bullet Points mit • statt -
- Zahlen in Euro (nicht USD), gerundet (Faktor ~0.92)
- Firmennamen fett gedacht (auf LinkedIn: einfach normal schreiben)
- Keine Links im Text

KRITISCH: Du bekommst echte Daten aus unserer GraphRAG-Datenbank. Verwende AUSSCHLIESSLICH die gelieferten Zahlen und Fakten. Erfinde NICHTS dazu. Wenn die Daten nicht ausreichen, schreib einen kuerzeren Post statt Zahlen zu erfinden.`;

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { topic, graphData, style } = await request.json();

    const styleHint = style === "analysis"
      ? "Schreibe einen analytischen Post mit Daten-Einordnung und Trend-Analyse."
      : style === "spotlight"
      ? "Schreibe einen Spotlight-Post ueber ein bestimmtes Unternehmen oder einen Deal."
      : style === "roundup"
      ? "Schreibe einen Wochen-Roundup der wichtigsten Deals."
      : "Schreibe einen informativen LinkedIn-Post.";

    const userMessage = `${styleHint}

Thema/Fokus: ${topic}

Die folgenden Daten wurden per GraphRAG direkt aus unserer Neo4j-Datenbank abgefragt. Jeder Block hat ein Label, das beschreibt was abgefragt wurde:

${graphData.map((block: { label: string; data: unknown[] }) =>
  `### ${block.label}\n${JSON.stringify(block.data, null, 2)}`
).join("\n\n")}

WICHTIG: Nutze NUR die obigen Daten. Erfinde keine zusaetzlichen Zahlen, Firmennamen oder Fakten.

Schreibe jetzt den LinkedIn-Post. Nur den Post-Text, keine Erklaerungen drumherum.`;

    const response = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    return NextResponse.json({
      post: text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    });
  } catch (error) {
    console.error("linkedin generate error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 500 }
    );
  }
}
