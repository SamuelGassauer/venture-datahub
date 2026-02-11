import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Anthropic client (singleton)
// ---------------------------------------------------------------------------

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

// ---------------------------------------------------------------------------
// EUR conversion
// ---------------------------------------------------------------------------

const USD_TO_EUR = 0.92;

export function convertToEur(amountUsd: number | null): number | null {
  if (!amountUsd) return null;
  return Math.round(amountUsd * USD_TO_EUR * 100) / 100;
}

export function fmtEur(amountUsd: number | null): string {
  if (!amountUsd) return "";
  const eur = amountUsd * USD_TO_EUR;
  if (eur >= 1e9) {
    const val = eur / 1e9;
    return `${val.toFixed(1).replace(".", ",")} Mrd. \u20AC`;
  }
  if (eur >= 1e6) {
    const val = eur / 1e6;
    return `${val.toFixed(1).replace(".", ",")} Mio. \u20AC`;
  }
  if (eur >= 1e3) {
    const val = eur / 1e3;
    return `${val.toFixed(0).replace(".", ",")} Tsd. \u20AC`;
  }
  return `${eur.toFixed(0).replace(".", ",")} \u20AC`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PostPromptData = {
  companyName: string;
  amountUsd: number | null;
  amountEur: string;
  stage: string | null;
  country: string | null;
  description: string | null;
  leadInvestor: string | null;
  allInvestors: string[];
  fundingHistory: { stage: string; amountUsd: number | null; date: string | null }[];
  totalRaised: number | null;
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Du bist ein Redakteur für einen deutschen Newsletter über Startup-Finanzierungsrunden.

REGELN:
- Deutsch, sachlich, ca. 800 Wörter
- Beträge in Euro: "X,X Mio. €" oder "X,X Mrd. €"
- Lead-Investor immer zuerst nennen
- Fehlende Infos weglassen (nicht raten)

STRUKTUR:
1. Einstieg (1 Absatz): [Name] sammelt [Betrag] in einer [Stage]-Runde ein. Kurze Einordnung der Runde.

2. Unternehmen (2-3 Absätze): Was macht die Firma? Produkt, Geschäftsmodell, Zielgruppe, Branche. Welches Problem wird gelöst? Was unterscheidet das Unternehmen von Wettbewerbern?

3. Investoren & Runde (1-2 Absätze): Die Runde wurde von [Lead] angeführt, mit Beteiligung von X, Y, Z. Hintergrund zu den wichtigsten Investoren. Wofür soll das Kapital eingesetzt werden (Expansion, Produktentwicklung, Teamaufbau etc.)?

4. Kontext & Einordnung (1-2 Absätze): Marktumfeld, Branchentrends, Vergleich mit ähnlichen Runden. Bisherige Finanzierungshistorie des Unternehmens.

5. Ausblick (1 Absatz): [Name] sitzt in [Stadt/Land] und hat insgesamt [Total] eingesammelt. Nächste Schritte, Wachstumspläne.

Antworte NUR mit dem Beitragstext.`;

// ---------------------------------------------------------------------------
// generatePost
// ---------------------------------------------------------------------------

export async function generatePost(data: PostPromptData): Promise<string> {
  const parts: string[] = [];

  parts.push(`Firma: ${data.companyName}`);
  if (data.amountEur) parts.push(`Betrag: ${data.amountEur}`);
  if (data.stage) parts.push(`Stage: ${data.stage}`);
  if (data.description) parts.push(`Beschreibung: ${data.description}`);
  if (data.country) parts.push(`Land: ${data.country}`);
  if (data.leadInvestor) parts.push(`Lead-Investor: ${data.leadInvestor}`);
  if (data.allInvestors.length > 0) {
    parts.push(`Alle Investoren: ${data.allInvestors.join(", ")}`);
  }
  if (data.fundingHistory.length > 0) {
    const history = data.fundingHistory
      .map((h) => {
        const amt = h.amountUsd ? fmtEur(h.amountUsd) : "unbekannt";
        return `${h.stage}: ${amt}${h.date ? ` (${h.date})` : ""}`;
      })
      .join("; ");
    parts.push(`Bisherige Runden: ${history}`);
  }
  if (data.totalRaised) {
    parts.push(`Insgesamt eingesammelt: ${fmtEur(data.totalRaised)}`);
  }

  const userMessage = parts.join("\n");

  const response = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.text?.trim() ?? "";
}
