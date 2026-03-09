"use client";

import { useState } from "react";
import { Database, Copy, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

function CopyButton({ text }: { text: string }) {
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        toast.success("Copied");
      }}
      className="absolute top-2 right-2 glass-capsule-btn p-1.5 text-foreground/40 hover:text-foreground/70"
      title="Copy"
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative lg-inset rounded-[10px] p-3">
      <CopyButton text={code} />
      <pre className="text-[12px] overflow-x-auto pr-8 font-mono text-foreground/70">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 mb-3">
      {children}
    </h2>
  );
}

function FieldTable({
  fields,
}: {
  fields: { name: string; type: string; required: string; notes: string }[];
}) {
  return (
    <div className="lg-inset rounded-[16px]">
      <table className="w-full text-[13px] tracking-[-0.01em]">
        <thead>
          <tr className="glass-table-header">
            <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
              Field
            </th>
            <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
              Type
            </th>
            <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
              Required
            </th>
            <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
              Notes
            </th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.name} className="lg-inset-table-row">
              <td className="px-3 py-2 font-mono text-[12px] text-blue-600 dark:text-blue-400 whitespace-nowrap">
                {f.name}
              </td>
              <td className="px-3 py-2 font-mono text-[12px] text-foreground/45 whitespace-nowrap">
                {f.type}
              </td>
              <td className="px-3 py-2 text-[12px] text-foreground/45">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    f.required === "Yes"
                      ? "bg-red-500/8 text-red-500"
                      : f.required === "Preferred"
                        ? "bg-amber-500/8 text-amber-600"
                        : "bg-foreground/[0.04] text-foreground/45"
                  }`}
                >
                  {f.required}
                </span>
              </td>
              <td className="px-3 py-2 text-[13px] text-foreground/45">
                {f.notes}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="lg-inset rounded-[14px]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-foreground/40" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-foreground/40" />
        )}
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-foreground/85">
          {title}
        </span>
      </button>
      {open && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </div>
  );
}

function EndpointBadge({ method, path, scope }: { method: string; path: string; scope: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span
        className="rounded-[6px] bg-emerald-500/8 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[12px] font-mono font-semibold"
        style={{ border: "0.5px solid rgba(16, 185, 129, 0.25)" }}
      >
        {method}
      </span>
      <code className="text-[15px] font-semibold tracking-[-0.02em] text-foreground/85">
        {path}
      </code>
      <span className="rounded-full bg-blue-500/8 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
        scope: {scope}
      </span>
    </div>
  );
}

// --- Data ---

const fundFields = [
  { name: "externalId", type: "String", required: "Yes", notes: "Stable unique identifier for this fund" },
  { name: "name", type: "String", required: "Yes", notes: 'Firm name (e.g. "Acme Ventures")' },
  { name: "website", type: "String", required: "Yes", notes: "Full URL. Primary dedup key" },
  { name: "linkedinUrl", type: "String", required: "Preferred", notes: "Firm LinkedIn page URL" },
  { name: "hq", type: "String", required: "Preferred", notes: 'HQ location (e.g. "London, UK")' },
  { name: "foundedAt", type: "String", required: "Preferred", notes: "ISO date (YYYY-MM-DD)" },
  { name: "description", type: "String", required: "Optional", notes: "Short description of the firm" },
  { name: "aumUsdMillions", type: "Number", required: "Preferred", notes: "AUM in USD millions (e.g. 150.0)" },
  { name: "minTicketUsd", type: "Number", required: "Preferred", notes: "Min cheque size in raw USD" },
  { name: "maxTicketUsd", type: "Number", required: "Preferred", notes: "Max cheque size in raw USD" },
  { name: "minRoundUsd", type: "Number", required: "Preferred", notes: "Min round size they participate in" },
  { name: "maxRoundUsd", type: "Number", required: "Preferred", notes: "Max round size they participate in" },
  { name: "roundRole", type: "String", required: "Preferred", notes: "LEAD, FOLLOW, or BOTH" },
  { name: "sectorFocus", type: "String[]", required: "Preferred", notes: "Array of sector codes (see Appendix)" },
  { name: "geoFocus", type: "String[]", required: "Preferred", notes: "Array of geography codes (see Appendix)" },
  { name: "updatedAt", type: "String", required: "Yes", notes: "ISO 8601 timestamp of last change" },
];

const startupFields = [
  { name: "externalId", type: "String", required: "Yes", notes: "Stable unique identifier" },
  { name: "name", type: "String", required: "Yes", notes: "Company name" },
  { name: "website", type: "String", required: "Yes", notes: "Full URL. Primary dedup key" },
  { name: "hq", type: "String", required: "Preferred", notes: "HQ location" },
  { name: "description", type: "String", required: "Optional", notes: "Short company description" },
  { name: "foundedAt", type: "String", required: "Optional", notes: "ISO date (YYYY-MM-DD)" },
  { name: "sector", type: "String[]", required: "Optional", notes: "Array of sector codes" },
  { name: "stage", type: "String", required: "Optional", notes: 'e.g. "Seed", "Series A", "Series B"' },
  { name: "founders", type: "Object[]", required: "Optional", notes: "Array of founder objects (see below)" },
  { name: "updatedAt", type: "String", required: "Yes", notes: "ISO 8601 timestamp of last change" },
];

const founderFields = [
  { name: "fullName", type: "String", required: "Yes", notes: "Full name of the founder" },
  { name: "linkedinUrl", type: "String", required: "Optional", notes: "LinkedIn profile URL" },
  { name: "role", type: "String", required: "Optional", notes: 'e.g. "CEO", "CTO", "Co-founder"' },
];

const investmentFields = [
  { name: "externalId", type: "String", required: "Yes", notes: "Stable unique ID for this investment record" },
  { name: "fundExternalId", type: "String", required: "Yes", notes: "References the VC fund's externalId" },
  { name: "startupExternalId", type: "String", required: "Yes", notes: "References the startup's externalId" },
  { name: "investmentDate", type: "String", required: "Preferred", notes: "ISO date (YYYY-MM-DD)" },
  { name: "investmentAmountUsd", type: "Number", required: "Preferred", notes: "This fund's cheque size in raw USD" },
  { name: "totalRoundSizeUsd", type: "Number", required: "Preferred", notes: "Total round size across all investors" },
  { name: "roundName", type: "String", required: "Preferred", notes: 'e.g. "Seed", "Series A"' },
  { name: "roundType", type: "String", required: "Optional", notes: "EQUITY, CONVERTIBLE, or NON_DILUTIVE" },
  { name: "coInvestors", type: "String[]", required: "Optional", notes: "Names of other investors in the round" },
  { name: "notes", type: "String", required: "Optional", notes: "Any additional context" },
  { name: "updatedAt", type: "String", required: "Yes", notes: "ISO 8601 timestamp of last change" },
];

const sectorCodes = [
  "AGRITECH", "AUTOMATION", "BIOTECH", "BUSINESS SOFTWARE", "CLIMATE", "CONSTRUCTION",
  "CONSUMER", "CHEMICALS", "CRYPTO", "CYBERSECURITY", "DATA", "DEEP TECH",
  "DEVELOPER TOOLS", "ECOM ENABLEMENT", "EDUCATION", "ENERGY", "FINTECH",
  "FUTURE OF WORK", "GAMING", "HEALTHCARE", "HUMAN RESOURCES", "INDUSTRY 4.0",
  "INSURANCE", "INTERNET OF THINGS", "LOGISTICS", "MACHINE LEARNING", "MEDIA",
  "PROPTECH", "ROBOTICS", "SUPPLY CHAIN", "SUSTAINABILITY", "TECHBIO", "WEB3",
  "SECTOR_AGNOSTIC",
];

const geoCodes = [
  "UK", "FRANCE", "NORDICS", "SOUTHERN_EUROPE", "BENELUX", "DACH", "CEE",
  "NORTH_AMERICA", "SOUTH_AMERICA", "EUROPE", "ASIA", "AFRICA", "AUSTRALIA",
  "MIDDLE_EAST", "LATAM",
];

const queryParams = [
  { name: "updated_since", type: "String", notes: "ISO datetime — only records where updatedAt >= value", default_: "—" },
  { name: "cursor", type: "String", notes: "Pagination cursor from previous response", default_: "—" },
  { name: "limit", type: "Number", notes: "Records per page (max 100)", default_: "50" },
];

const fundResponseExample = `{
  "data": [
    {
      "externalId": "fund_abc123",
      "name": "Acme Ventures",
      "website": "https://acme.vc",
      "linkedinUrl": "https://linkedin.com/company/acme-ventures",
      "hq": "London, UK",
      "foundedAt": "2018-06-15",
      "description": "Early-stage VC focused on climate and fintech",
      "aumUsdMillions": 150.0,
      "minTicketUsd": 500000,
      "maxTicketUsd": 5000000,
      "minRoundUsd": 1000000,
      "maxRoundUsd": 20000000,
      "roundRole": "LEAD",
      "sectorFocus": ["FINTECH", "CLIMATE"],
      "geoFocus": ["UK", "NORDICS", "DACH"],
      "updatedAt": "2025-03-01T12:00:00Z"
    }
  ],
  "pagination": {
    "cursor": "eyJpZCI6ImZ1bmRfYWJjMTI0In0=",
    "hasMore": true
  }
}`;

const startupResponseExample = `{
  "data": [
    {
      "externalId": "startup_xyz789",
      "name": "ScyAI",
      "website": "https://scyai.com",
      "hq": "Berlin, Germany",
      "description": "AI-driven risk intelligence platform",
      "foundedAt": "2022-03-01",
      "sector": ["CYBERSECURITY", "MACHINE LEARNING"],
      "stage": "Seed",
      "founders": [
        {
          "fullName": "Max Mustermann",
          "linkedinUrl": "https://linkedin.com/in/max-mustermann",
          "role": "CEO"
        }
      ],
      "updatedAt": "2025-03-01T12:00:00Z"
    }
  ],
  "pagination": {
    "cursor": "eyJpZCI6InN0YXJ0dXBfeHl6NzkwIn0=",
    "hasMore": false
  }
}`;

const investmentResponseExample = `{
  "data": [
    {
      "externalId": "inv_def456",
      "fundExternalId": "fund_abc123",
      "startupExternalId": "startup_xyz789",
      "investmentDate": "2025-02-15",
      "investmentAmountUsd": 2000000,
      "totalRoundSizeUsd": 5000000,
      "roundName": "Seed",
      "roundType": "EQUITY",
      "coInvestors": ["Sequoia Capital", "Index Ventures"],
      "notes": null,
      "updatedAt": "2025-03-01T12:00:00Z"
    }
  ],
  "pagination": {
    "cursor": "eyJpZCI6Imludl9kZWY0NTcifQ==",
    "hasMore": false
  }
}`;

const curlExample = `curl -X GET "https://orbit.inventure.capital/api/v1/investors?updated_since=2025-01-01T00:00:00Z&limit=50" \\
  -H "Authorization: Bearer orb_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"`;

const errors = [
  { status: "401", body: '{"error": "Missing or invalid API key"}', desc: "Missing or invalid API key" },
  { status: "403", body: '{"error": "API key has been revoked"}', desc: "Key has been deactivated" },
  { status: "403", body: '{"error": "API key has expired"}', desc: "Key has expired" },
  { status: "403", body: '{"error": "Insufficient scope"}', desc: "Missing permission for this endpoint" },
  { status: "429", body: '{"error": "Rate limit exceeded"}', desc: "Rate limit exceeded" },
  { status: "500", body: '{"error": "Internal server error"}', desc: "Internal server error" },
];

export default function DataApiDocsPage() {
  return (
    <div className="flex h-[calc(100vh-1.5rem)] flex-col">
      {/* Toolbar */}
      <div className="glass-status-bar px-4 py-2.5 flex items-center gap-3">
        <Database className="h-4 w-4 text-foreground/40" />
        <span className="text-[17px] font-semibold tracking-[-0.02em] text-foreground/85">
          Data Provider API
        </span>
        <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">
          v1
        </span>
        <span className="ml-auto rounded-full bg-emerald-500/8 px-2.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
          Live
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-4xl space-y-6 pb-8">
          {/* Overview */}
          <section>
            <SectionHeading>Overview</SectionHeading>
            <p className="text-[13px] text-foreground/55 tracking-[-0.01em] mb-3">
              The Data Provider API provides structured data on investors, startups, and investments
              via three paginated REST endpoints. All endpoints support incremental sync
              via <code className="rounded-[6px] bg-foreground/[0.04] px-1.5 py-0.5 text-[12px] font-mono">updated_since</code>.
            </p>
            <div className="lg-inset rounded-[16px]">
              <table className="w-full text-[13px] tracking-[-0.01em]">
                <thead>
                  <tr className="glass-table-header">
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                      Entity
                    </th>
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                      Endpoint
                    </th>
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="lg-inset-table-row">
                    <td className="px-3 py-2 text-[13px] font-semibold text-foreground/85">VC Fund</td>
                    <td className="px-3 py-2 font-mono text-[12px] text-blue-600 dark:text-blue-400">
                      GET /api/v1/investors
                    </td>
                    <td className="px-3 py-2 text-foreground/45">
                      VC firms and their investment profiles
                    </td>
                  </tr>
                  <tr className="lg-inset-table-row">
                    <td className="px-3 py-2 text-[13px] font-semibold text-foreground/85">Startup</td>
                    <td className="px-3 py-2 font-mono text-[12px] text-blue-600 dark:text-blue-400">
                      GET /api/v1/startups
                    </td>
                    <td className="px-3 py-2 text-foreground/45">
                      Companies with venture funding
                    </td>
                  </tr>
                  <tr className="lg-inset-table-row">
                    <td className="px-3 py-2 text-[13px] font-semibold text-foreground/85">Investment</td>
                    <td className="px-3 py-2 font-mono text-[12px] text-blue-600 dark:text-blue-400">
                      GET /api/v1/investments
                    </td>
                    <td className="px-3 py-2 text-foreground/45">
                      Individual fund participations in a funding round
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Auth */}
          <section>
            <SectionHeading>Authentication</SectionHeading>
            <p className="text-[13px] text-foreground/55 tracking-[-0.01em] mb-3">
              All endpoints require an API key as a Bearer token in the{" "}
              <code className="rounded-[6px] bg-foreground/[0.04] px-1.5 py-0.5 text-[12px] font-mono">
                Authorization
              </code>{" "}
              header. Keys can be created under{" "}
              <Link
                href="/app/admin/api-keys"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Admin &rarr; API Keys
              </Link>.
            </p>
            <CodeBlock code="Authorization: Bearer orb_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
            <div className="mt-3 space-y-1 text-[12px] text-foreground/45">
              <p>
                &bull; Keys start with{" "}
                <code className="font-mono bg-foreground/[0.04] px-1 rounded">orb_</code> and
                are displayed once upon creation
              </p>
              <p>
                &bull; Each key has defined <strong>Scopes</strong> — the Data Provider API
                requires the scope{" "}
                <code className="font-mono bg-foreground/[0.04] px-1 rounded">data-provider</code>
              </p>
              <p>&bull; Rate limits apply per key (default: 1,000 req/h)</p>
            </div>
          </section>

          {/* Pagination & Sync */}
          <section>
            <SectionHeading>Pagination & Incremental Sync</SectionHeading>
            <p className="text-[13px] text-foreground/55 tracking-[-0.01em] mb-3">
              All three endpoints use cursor-based pagination. For efficient syncs,
              pass <code className="rounded-[6px] bg-foreground/[0.04] px-1.5 py-0.5 text-[12px] font-mono">updated_since</code>{" "}
              — only records where{" "}
              <code className="rounded-[6px] bg-foreground/[0.04] px-1.5 py-0.5 text-[12px] font-mono">updatedAt &gt;= updated_since</code> are returned.
            </p>
            <div className="lg-inset rounded-[16px]">
              <table className="w-full text-[13px] tracking-[-0.01em]">
                <thead>
                  <tr className="glass-table-header">
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                      Parameter
                    </th>
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                      Type
                    </th>
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                      Description
                    </th>
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                      Default
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {queryParams.map((p) => (
                    <tr key={p.name} className="lg-inset-table-row">
                      <td className="px-3 py-2 font-mono text-[12px] text-blue-600 dark:text-blue-400">
                        {p.name}
                      </td>
                      <td className="px-3 py-2 font-mono text-[12px] text-foreground/45">
                        {p.type}
                      </td>
                      <td className="px-3 py-2 text-foreground/45">{p.notes}</td>
                      <td className="px-3 py-2 font-mono text-[12px] text-foreground/45">
                        {p.default_}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3">
              <p className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 mb-2">
                Pagination Response
              </p>
              <CodeBlock
                code={`{
  "data": [ ... ],
  "pagination": {
    "cursor": "abc123",   // pass as ?cursor=abc123 for next page
    "hasMore": true       // false when no more records
  }
}`}
              />
            </div>
          </section>

          {/* Request example */}
          <section>
            <SectionHeading>Example Request</SectionHeading>
            <CodeBlock code={curlExample} />
          </section>

          {/* --- ENDPOINTS --- */}
          <div className="pt-2">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-foreground/85 mb-4">
              Endpoints
            </h2>
          </div>

          {/* Funds */}
          <CollapsibleSection title="Investors" defaultOpen>
            <EndpointBadge method="GET" path="/api/v1/investors" scope="data-provider" />
            <p className="text-[13px] text-foreground/55 tracking-[-0.01em]">
              Returns all investors with investment profile, ticket sizes, and focus areas.
              Website is the primary dedup key, LinkedIn URL is the fallback.
            </p>
            <FieldTable fields={fundFields} />
            <div>
              <p className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 mb-2">
                Response{" "}
                <span className="text-emerald-600 dark:text-emerald-400">200 OK</span>
              </p>
              <CodeBlock code={fundResponseExample} />
            </div>
          </CollapsibleSection>

          {/* Startups */}
          <CollapsibleSection title="Startups">
            <EndpointBadge method="GET" path="/api/v1/startups" scope="data-provider" />
            <p className="text-[13px] text-foreground/55 tracking-[-0.01em]">
              Returns all startups with company data, sector classification, and optional founder information.
            </p>
            <FieldTable fields={startupFields} />
            <div>
              <p className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 mb-2">
                Founders (nested)
              </p>
              <FieldTable fields={founderFields} />
            </div>
            <div>
              <p className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 mb-2">
                Response{" "}
                <span className="text-emerald-600 dark:text-emerald-400">200 OK</span>
              </p>
              <CodeBlock code={startupResponseExample} />
            </div>
          </CollapsibleSection>

          {/* Investments */}
          <CollapsibleSection title="Investments">
            <EndpointBadge method="GET" path="/api/v1/investments" scope="data-provider" />
            <p className="text-[13px] text-foreground/55 tracking-[-0.01em] mb-2">
              Each record represents a single investor&apos;s participation in a funding round.{" "}
              <code className="rounded-[6px] bg-foreground/[0.04] px-1.5 py-0.5 text-[12px] font-mono">investmentAmountUsd</code>{" "}
              is this fund&apos;s cheque size,{" "}
              <code className="rounded-[6px] bg-foreground/[0.04] px-1.5 py-0.5 text-[12px] font-mono">totalRoundSizeUsd</code>{" "}
              is the total round size.
            </p>
            <FieldTable fields={investmentFields} />
            <div>
              <p className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 mb-2">
                Response{" "}
                <span className="text-emerald-600 dark:text-emerald-400">200 OK</span>
              </p>
              <CodeBlock code={investmentResponseExample} />
            </div>
          </CollapsibleSection>

          {/* Data Format */}
          <section>
            <SectionHeading>Data Format</SectionHeading>
            <div className="lg-inset rounded-[16px]">
              <table className="w-full text-[13px] tracking-[-0.01em]">
                <thead>
                  <tr className="glass-table-header">
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                      Rule
                    </th>
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="lg-inset-table-row">
                    <td className="px-3 py-2 font-semibold text-foreground/85">IDs</td>
                    <td className="px-3 py-2 text-foreground/45">
                      Each record has a stable <code className="font-mono bg-foreground/[0.04] px-1 rounded text-[12px]">externalId</code> that does not change between syncs
                    </td>
                  </tr>
                  <tr className="lg-inset-table-row">
                    <td className="px-3 py-2 font-semibold text-foreground/85">Monetary Amounts</td>
                    <td className="px-3 py-2 text-foreground/45">
                      Raw numbers in USD (no formatted strings like &quot;$1.5M&quot;)
                    </td>
                  </tr>
                  <tr className="lg-inset-table-row">
                    <td className="px-3 py-2 font-semibold text-foreground/85">Dates</td>
                    <td className="px-3 py-2 text-foreground/45">
                      ISO 8601 — <code className="font-mono bg-foreground/[0.04] px-1 rounded text-[12px]">YYYY-MM-DD</code> for dates,{" "}
                      <code className="font-mono bg-foreground/[0.04] px-1 rounded text-[12px]">YYYY-MM-DDTHH:mm:ssZ</code> for timestamps
                    </td>
                  </tr>
                  <tr className="lg-inset-table-row">
                    <td className="px-3 py-2 font-semibold text-foreground/85">Multi-Selects</td>
                    <td className="px-3 py-2 text-foreground/45">
                      JSON arrays of strings — no comma-separated strings
                    </td>
                  </tr>
                  <tr className="lg-inset-table-row">
                    <td className="px-3 py-2 font-semibold text-foreground/85">Encoding</td>
                    <td className="px-3 py-2 text-foreground/45">UTF-8, JSON</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Errors */}
          <section>
            <SectionHeading>Error Responses</SectionHeading>
            <div className="lg-inset rounded-[16px]">
              <table className="w-full text-[13px] tracking-[-0.01em]">
                <thead>
                  <tr className="glass-table-header">
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 w-16">
                      Status
                    </th>
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                      Body
                    </th>
                    <th className="text-left px-3 py-2 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((e, i) => (
                    <tr key={i} className="lg-inset-table-row">
                      <td className="px-3 py-2 font-mono text-[12px] text-red-500">{e.status}</td>
                      <td className="px-3 py-2 font-mono text-[12px] text-foreground/45">
                        {e.body}
                      </td>
                      <td className="px-3 py-2 text-[13px] text-foreground/45">{e.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Rate Limits */}
          <section>
            <SectionHeading>Rate Limiting</SectionHeading>
            <p className="text-[13px] text-foreground/55 tracking-[-0.01em] mb-3">
              Each API key has an individual rate limit. Response headers on every request:
            </p>
            <CodeBlock
              code={`X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 997
Retry-After: 60          // only on 429`}
            />
          </section>

          {/* Appendix: Sectors */}
          <CollapsibleSection title="Appendix A — Sector Codes">
            <p className="text-[13px] text-foreground/55 tracking-[-0.01em] mb-3">
              Canonical sector codes for <code className="font-mono bg-foreground/[0.04] px-1 rounded text-[12px]">sectorFocus</code> and{" "}
              <code className="font-mono bg-foreground/[0.04] px-1 rounded text-[12px]">sector</code>.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {sectorCodes.map((code) => (
                <span
                  key={code}
                  className="rounded-full bg-foreground/[0.04] px-2.5 py-1 text-[11px] font-mono font-medium text-foreground/55"
                >
                  {code}
                </span>
              ))}
            </div>
          </CollapsibleSection>

          {/* Appendix: Geo */}
          <CollapsibleSection title="Appendix B — Geography Codes">
            <p className="text-[13px] text-foreground/55 tracking-[-0.01em] mb-3">
              Canonical geography codes for <code className="font-mono bg-foreground/[0.04] px-1 rounded text-[12px]">geoFocus</code>.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {geoCodes.map((code) => (
                <span
                  key={code}
                  className="rounded-full bg-foreground/[0.04] px-2.5 py-1 text-[11px] font-mono font-medium text-foreground/55"
                >
                  {code}
                </span>
              ))}
            </div>
          </CollapsibleSection>

          {/* Appendix: Round Types */}
          <CollapsibleSection title="Appendix C — Enum Values">
            <div className="space-y-3">
              <div>
                <p className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 mb-2">
                  roundRole
                </p>
                <div className="flex gap-1.5">
                  {["LEAD", "FOLLOW", "BOTH"].map((v) => (
                    <span key={v} className="rounded-full bg-foreground/[0.04] px-2.5 py-1 text-[11px] font-mono font-medium text-foreground/55">
                      {v}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 mb-2">
                  roundType
                </p>
                <div className="flex gap-1.5">
                  {["EQUITY", "CONVERTIBLE", "NON_DILUTIVE"].map((v) => (
                    <span key={v} className="rounded-full bg-foreground/[0.04] px-2.5 py-1 text-[11px] font-mono font-medium text-foreground/55">
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Sync Strategy */}
          <section>
            <SectionHeading>Sync Strategy</SectionHeading>
            <div className="lg-inset rounded-[14px] p-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/8 text-[12px] font-semibold text-blue-600 dark:text-blue-400">
                  1
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-foreground/85">Initial Import</p>
                  <p className="text-[12px] text-foreground/45">
                    Call all three endpoints without <code className="font-mono bg-foreground/[0.04] px-1 rounded">updated_since</code>.
                    Use cursor pagination until <code className="font-mono bg-foreground/[0.04] px-1 rounded">hasMore: false</code>.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/8 text-[12px] font-semibold text-blue-600 dark:text-blue-400">
                  2
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-foreground/85">Incremental Syncs</p>
                  <p className="text-[12px] text-foreground/45">
                    Store the timestamp of the last successful sync and pass it as{" "}
                    <code className="font-mono bg-foreground/[0.04] px-1 rounded">updated_since</code>.
                    Recommended: daily or weekly.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/8 text-[12px] font-semibold text-blue-600 dark:text-blue-400">
                  3
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-foreground/85">Deletions</p>
                  <p className="text-[12px] text-foreground/45">
                    Deleted records are returned with a{" "}
                    <code className="font-mono bg-foreground/[0.04] px-1 rounded">deletedAt</code> timestamp
                    and can be removed locally.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
