"use client";

import { Code2, Copy } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

function CopyButton({ text }: { text: string }) {
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        toast.success("Kopiert");
      }}
      className="absolute top-2 right-2 glass-capsule-btn p-1.5 text-foreground/40 hover:text-foreground/70"
      title="Kopieren"
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
}

const curlExample = `curl -X GET "https://<your-domain>/api/funding-rounds?status=published&since=2026-01-01" \\
  -H "Authorization: ApiKey orb_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"`;

const responseExample = `{
  "data": [
    {
      "roundKey": "scyai_seed_42",
      "company": {
        "name": "ScyAI",
        "description": "AI-driven risk intelligence platform...",
        "logoUrl": "https://example.com/scyai-logo.png",
        "website": "https://scyai.com",
        "country": "Germany"
      },
      "funding": {
        "amountUsd": 5000000,
        "amountEur": 4650000,
        "stage": "Seed",
        "currency": "EUR"
      },
      "investors": [
        {
          "name": "Earlybird Venture Capital",
          "logoUrl": "https://example.com/earlybird-logo.png",
          "isLead": true
        }
      ],
      "articleDate": "2026-02-10T12:00:00.000Z",
      "sourceUrl": "https://techcrunch.com/2026/02/10/scyai-seed",
      "post": {
        "content": "ScyAI sichert sich 5 Mio. USD...",
        "publishedAt": "2026-02-10T14:30:00.000Z"
      }
    }
  ],
  "total": 1
}`;

const fields: { name: string; type: string; desc: string }[] = [
  { name: "roundKey", type: "string", desc: "Stable unique identifier" },
  { name: "company.name", type: "string", desc: "Company name" },
  { name: "company.description", type: "string | null", desc: "Company description" },
  { name: "company.logoUrl", type: "string | null", desc: "Company logo URL" },
  { name: "company.website", type: "string | null", desc: "Company website" },
  { name: "company.country", type: "string | null", desc: "Company country" },
  { name: "funding.amountUsd", type: "number | null", desc: "Amount in USD" },
  { name: "funding.amountEur", type: "number | null", desc: "Amount in EUR (converted)" },
  { name: "funding.stage", type: "string | null", desc: "Pre-Seed, Seed, Series A\u2013D, Growth, Late Stage, Debt, Grant" },
  { name: "funding.currency", type: "string", desc: 'Always "EUR"' },
  { name: "investors[]", type: "array", desc: "List of participating investors" },
  { name: "investors[].name", type: "string", desc: "Investor name" },
  { name: "investors[].logoUrl", type: "string | null", desc: "Investor logo URL" },
  { name: "investors[].isLead", type: "boolean", desc: "Whether this investor is the lead" },
  { name: "articleDate", type: "string | null", desc: "ISO 8601 source article date" },
  { name: "sourceUrl", type: "string | null", desc: "URL of the source article" },
  { name: "post", type: "object | null", desc: "Generated post (null if none)" },
  { name: "post.content", type: "string", desc: "Post text content" },
  { name: "post.publishedAt", type: "string | null", desc: "ISO 8601 publish timestamp" },
  { name: "total", type: "number", desc: "Total number of results" },
];

const queryParams: { name: string; type: string; desc: string; default_: string }[] = [
  { name: "status", type: "string", desc: '"all" | "with_post" | "published"', default_: "all" },
  { name: "since", type: "string", desc: "ISO date \u2014 only rounds with articleDate >= since", default_: "\u2014" },
];

const errors = [
  { status: "401", body: '{"error": "Missing API key..."}', desc: "Kein API Key im Header" },
  { status: "401", body: '{"error": "Invalid API key"}', desc: "Key existiert nicht" },
  { status: "403", body: '{"error": "API key has been revoked"}', desc: "Key wurde deaktiviert" },
  { status: "403", body: '{"error": "API key has expired"}', desc: "Key ist abgelaufen" },
  { status: "403", body: '{"error": "API key does not have scope: ..."}', desc: "Fehlende Berechtigung" },
  { status: "429", body: '{"error": "Rate limit exceeded", ...}', desc: "Rate Limit erreicht" },
  { status: "500", body: '{"error": "Failed to fetch..."}', desc: "Interner Serverfehler" },
];

export default function ApiDocsPage() {
  return (
    <div className="flex h-[calc(100vh-1.5rem)] flex-col">
      {/* Toolbar */}
      <div className="glass-status-bar px-4 py-2.5 flex items-center gap-3">
        <Code2 className="h-4 w-4 text-foreground/40" />
        <span className="text-[17px] font-semibold tracking-[-0.02em] text-foreground/85">Orbit API</span>
        <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">Documentation</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-3xl space-y-6 pb-8">
          {/* Auth */}
          <section>
            <h2 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 mb-2">Authentifizierung</h2>
            <p className="text-[13px] text-foreground/55 tracking-[-0.01em] mb-3">
              Alle API-Endpunkte erfordern einen API Key im <code className="rounded-[6px] bg-foreground/[0.04] px-1.5 py-0.5 text-[12px] font-mono">Authorization</code> Header.
              Keys können unter{" "}
              <Link href="/app/admin/api-keys" className="text-blue-600 dark:text-blue-400 hover:underline">
                Admin &rarr; API Keys
              </Link>{" "}
              erstellt und verwaltet werden.
            </p>
            <div className="relative lg-inset rounded-[10px] p-3">
              <CopyButton text="Authorization: ApiKey orb_xxxxxxxxxxxxxx" />
              <code className="text-[12px] font-mono text-foreground/70">Authorization: ApiKey orb_xxxxxxxxxxxxxx</code>
            </div>
            <div className="mt-3 space-y-1 text-[12px] text-foreground/45">
              <p>&bull; Keys beginnen mit <code className="font-mono bg-foreground/[0.04] px-1 rounded">orb_</code></p>
              <p>&bull; Jeder Key hat definierte <strong>Scopes</strong> (Berechtigungen) und ein <strong>Rate Limit</strong></p>
              <p>&bull; Nutzung wird pro Key getrackt (Requests, IP, Zeitstempel)</p>
              <p>&bull; Keys können jederzeit deaktiviert oder mit Ablaufdatum versehen werden</p>
            </div>
          </section>

          {/* Scopes */}
          <section>
            <h2 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 mb-3">Verfügbare Scopes</h2>
            <div className="lg-inset rounded-[16px]">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="glass-table-header">
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Scope</th>
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Zugriff auf</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="lg-inset-table-row">
                    <td className="px-3 py-2 font-mono text-[12px] text-blue-600 dark:text-blue-400">funding-rounds</td>
                    <td className="px-3 py-2 text-foreground/45">GET /api/funding-rounds</td>
                  </tr>
                  <tr className="lg-inset-table-row">
                    <td className="px-3 py-2 font-mono text-[12px] text-blue-600 dark:text-blue-400">companies</td>
                    <td className="px-3 py-2 text-foreground/45">GET /api/v1/companies (geplant)</td>
                  </tr>
                  <tr className="lg-inset-table-row">
                    <td className="px-3 py-2 font-mono text-[12px] text-blue-600 dark:text-blue-400">fund-events</td>
                    <td className="px-3 py-2 text-foreground/45">GET /api/v1/fund-events (geplant)</td>
                  </tr>
                  <tr className="lg-inset-table-row">
                    <td className="px-3 py-2 font-mono text-[12px] text-blue-600 dark:text-blue-400">*</td>
                    <td className="px-3 py-2 text-foreground/45">Zugriff auf alle Endpoints</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Rate Limits */}
          <section>
            <h2 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 mb-2">Rate Limiting</h2>
            <p className="text-[13px] text-foreground/55 tracking-[-0.01em] mb-3">
              Jeder API Key hat ein individuelles Rate Limit (Standard: 100 req/h). Bei Überschreitung wird HTTP 429 zurückgegeben.
            </p>
            <div className="lg-inset rounded-[10px] p-3 space-y-1 text-[12px] font-mono text-foreground/55">
              <p>X-RateLimit-Limit: 100</p>
              <p>X-RateLimit-Remaining: 0</p>
              <p>Retry-After: 60</p>
            </div>
          </section>

          {/* Endpoint */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-[6px] bg-emerald-500/8 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[12px] font-mono font-semibold" style={{ border: "0.5px solid rgba(16, 185, 129, 0.25)" }}>
                GET
              </span>
              <code className="text-[15px] font-semibold tracking-[-0.02em] text-foreground/85">/api/funding-rounds</code>
              <span className="rounded-full bg-blue-500/8 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                scope: funding-rounds
              </span>
            </div>
            <p className="text-[13px] text-foreground/55 tracking-[-0.01em]">
              Liefert alle Funding-Runden mit Firmendaten, Investoren (inkl. Logos) und Beitrags-Content.
              Sortiert nach Artikeldatum (neueste zuerst).
            </p>
          </section>

          {/* Query params */}
          <section>
            <h2 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 mb-3">Query Parameter</h2>
            <div className="lg-inset rounded-[16px]">
              <table className="w-full text-[13px] tracking-[-0.01em]">
                <thead>
                  <tr className="glass-table-header">
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Parameter</th>
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Werte</th>
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Default</th>
                  </tr>
                </thead>
                <tbody>
                  {queryParams.map((p) => (
                    <tr key={p.name} className="lg-inset-table-row">
                      <td className="px-3 py-2 font-mono text-[12px] text-blue-600 dark:text-blue-400">{p.name}</td>
                      <td className="px-3 py-2 font-mono text-[12px] text-foreground/45">{p.desc}</td>
                      <td className="px-3 py-2 font-mono text-[12px] text-foreground/45">{p.default_}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Request example */}
          <section>
            <h3 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 mb-2">Request</h3>
            <div className="relative lg-inset rounded-[10px] p-3">
              <CopyButton text={curlExample} />
              <pre className="text-[12px] overflow-x-auto pr-8 font-mono text-foreground/70"><code>{curlExample}</code></pre>
            </div>
          </section>

          {/* Response example */}
          <section>
            <h3 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 mb-2">
              Response <span className="text-emerald-600 dark:text-emerald-400">200 OK</span>
            </h3>
            <div className="relative lg-inset rounded-[10px] p-3">
              <CopyButton text={responseExample} />
              <pre className="text-[12px] overflow-x-auto max-h-[400px] pr-8 font-mono text-foreground/70"><code>{responseExample}</code></pre>
            </div>
          </section>

          {/* Fields table */}
          <section>
            <h2 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 mb-3">Response Fields</h2>
            <div className="lg-inset rounded-[16px]">
              <table className="w-full text-[13px] tracking-[-0.01em]">
                <thead>
                  <tr className="glass-table-header">
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Field</th>
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Type</th>
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f) => (
                    <tr key={f.name} className="lg-inset-table-row">
                      <td className="px-3 py-2 font-mono text-[12px] text-blue-600 dark:text-blue-400 whitespace-nowrap">{f.name}</td>
                      <td className="px-3 py-2 font-mono text-[12px] text-foreground/45 whitespace-nowrap">{f.type}</td>
                      <td className="px-3 py-2 text-[13px] text-foreground/45">{f.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Errors */}
          <section>
            <h2 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 mb-3">Error Responses</h2>
            <div className="lg-inset rounded-[16px]">
              <table className="w-full text-[13px] tracking-[-0.01em]">
                <thead>
                  <tr className="glass-table-header">
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 w-16">Status</th>
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Body</th>
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Beschreibung</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((e, i) => (
                    <tr key={i} className="lg-inset-table-row">
                      <td className="px-3 py-2 font-mono text-[12px] text-red-500">{e.status}</td>
                      <td className="px-3 py-2 font-mono text-[12px] text-foreground/45">{e.body}</td>
                      <td className="px-3 py-2 text-[13px] text-foreground/45">{e.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
