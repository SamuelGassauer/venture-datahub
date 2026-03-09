import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

type TestResult = {
  name: string;
  status: "pass" | "fail" | "skip";
  duration: number;
  error?: string;
};

type SuiteResult = {
  suite: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBaseUrl(request: NextRequest): string {
  const proto = request.headers.get("x-forwarded-proto") || "http";
  const host = request.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

async function fetchApi(base: string, path: string, params: Record<string, string> = {}) {
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

function buildSuites(base: string) {
  return [
    {
      suite: "Meta",
      tests: [
        {
          name: "Gibt Filter-Werte zurück",
          fn: async () => {
            const data = await fetchApi(base, "/api/v1/meta");
            assert(Array.isArray(data.countries), "countries fehlt");
            assert(Array.isArray(data.sectors), "sectors fehlt");
            assert(Array.isArray(data.stages), "stages fehlt");
          },
        },
      ],
    },
    {
      suite: "Investors",
      tests: [
        {
          name: "Response-Shape { data, pagination }",
          fn: async () => {
            const res = await fetchApi(base, "/api/v1/investors", { limit: "3" });
            assert(Array.isArray(res.data), "data ist kein Array");
            assert(typeof res.pagination === "object", "pagination fehlt");
            assert(typeof res.pagination.hasMore === "boolean", "hasMore fehlt");
          },
        },
        {
          name: "Required Fields vorhanden",
          fn: async () => {
            const res = await fetchApi(base, "/api/v1/investors", { limit: "3" });
            for (const inv of res.data) {
              assert(!!inv.externalId, "externalId fehlt");
              assert(!!inv.name, "name fehlt");
              assert(typeof inv.dealCount === "number", "dealCount kein number");
              assert(inv.dealCount > 0, "dealCount ist 0");
            }
          },
        },
        {
          name: "roundRole = LEAD | FOLLOW | BOTH",
          fn: async () => {
            const res = await fetchApi(base, "/api/v1/investors", { limit: "10" });
            for (const inv of res.data) {
              assert(["LEAD", "FOLLOW", "BOTH"].includes(inv.roundRole), `Ungültige roundRole: ${inv.roundRole}`);
            }
          },
        },
        {
          name: "hq ist kombinierter String (kein hqCity/hqCountry)",
          fn: async () => {
            const res = await fetchApi(base, "/api/v1/investors", { limit: "5" });
            for (const inv of res.data) {
              assert(!("hqCity" in inv), "hqCity sollte nicht existieren");
              assert(!("hqCountry" in inv), "hqCountry sollte nicht existieren");
              if (inv.hq) assert(typeof inv.hq === "string", "hq ist kein String");
            }
          },
        },
        {
          name: "sectorFocus ist String-Array",
          fn: async () => {
            const res = await fetchApi(base, "/api/v1/investors", { limit: "5" });
            for (const inv of res.data) {
              assert(Array.isArray(inv.sectorFocus), "sectorFocus fehlt");
              assert(!("sectors" in inv), "sectors sollte sectorFocus heißen");
            }
          },
        },
        {
          name: "Name-Filter funktioniert",
          fn: async () => {
            const all = await fetchApi(base, "/api/v1/investors", { limit: "1" });
            if (!all.data[0]?.name) return;
            const name = all.data[0].name;
            const res = await fetchApi(base, "/api/v1/investors", { name });
            assert(res.data.length > 0, "Kein Ergebnis");
            for (const inv of res.data) {
              assert(inv.name.toLowerCase().includes(name.toLowerCase()), `${inv.name} enthält nicht "${name}"`);
            }
          },
        },
        {
          name: "ID-Filter liefert exakten Treffer",
          fn: async () => {
            const all = await fetchApi(base, "/api/v1/investors", { limit: "1" });
            if (!all.data[0]?.externalId) return;
            const id = all.data[0].externalId;
            const res = await fetchApi(base, "/api/v1/investors", { id });
            assert(res.data.length === 1, `Erwartet 1, bekommen ${res.data.length}`);
            assert(res.data[0].externalId === id, "Falsche ID zurück");
          },
        },
        {
          name: "Limit wird respektiert",
          fn: async () => {
            const res = await fetchApi(base, "/api/v1/investors", { limit: "2" });
            assert(res.data.length <= 2, `Erwartet max 2, bekommen ${res.data.length}`);
          },
        },
        {
          name: "Cursor-Pagination liefert nächste Seite",
          fn: async () => {
            const p1 = await fetchApi(base, "/api/v1/investors", { limit: "2" });
            if (!p1.pagination.cursor) return;
            const p2 = await fetchApi(base, "/api/v1/investors", { limit: "2", cursor: p1.pagination.cursor });
            assert(p2.data.length > 0, "Seite 2 ist leer");
          },
        },
      ],
    },
    {
      suite: "Startups",
      tests: [
        {
          name: "Response-Shape { data, pagination }",
          fn: async () => {
            const res = await fetchApi(base, "/api/v1/startups", { limit: "3" });
            assert(Array.isArray(res.data), "data ist kein Array");
            assert(typeof res.pagination === "object", "pagination fehlt");
          },
        },
        {
          name: "fundingRounds ist verschachteltes Array",
          fn: async () => {
            const res = await fetchApi(base, "/api/v1/startups", { limit: "5" });
            for (const s of res.data) {
              assert(Array.isArray(s.fundingRounds), "fundingRounds fehlt");
              for (const fr of s.fundingRounds) {
                assert("roundExternalId" in fr, "roundExternalId fehlt");
                assert(Array.isArray(fr.investors), "investors in Runde fehlt");
              }
            }
          },
        },
        {
          name: "Name-Filter funktioniert",
          fn: async () => {
            const all = await fetchApi(base, "/api/v1/startups", { limit: "1" });
            if (!all.data[0]?.name) return;
            const name = all.data[0].name;
            const res = await fetchApi(base, "/api/v1/startups", { name });
            assert(res.data.length > 0, "Kein Ergebnis");
            for (const s of res.data) {
              assert(s.name.toLowerCase().includes(name.toLowerCase()), `${s.name} enthält nicht "${name}"`);
            }
          },
        },
        {
          name: "ID-Filter liefert exakten Treffer",
          fn: async () => {
            const all = await fetchApi(base, "/api/v1/startups", { limit: "1" });
            if (!all.data[0]?.externalId) return;
            const id = all.data[0].externalId;
            const res = await fetchApi(base, "/api/v1/startups", { id });
            assert(res.data.length === 1, `Erwartet 1, bekommen ${res.data.length}`);
            assert(res.data[0].externalId === id, "Falsche ID zurück");
          },
        },
        {
          name: "Limit und Pagination",
          fn: async () => {
            const res = await fetchApi(base, "/api/v1/startups", { limit: "2" });
            assert(res.data.length <= 2, `Erwartet max 2, bekommen ${res.data.length}`);
          },
        },
      ],
    },
    {
      suite: "Investments (1:1)",
      tests: [
        {
          name: "Response-Shape { data, pagination }",
          fn: async () => {
            const res = await fetchApi(base, "/api/v1/investments", { limit: "3" });
            assert(Array.isArray(res.data), "data ist kein Array");
            assert(typeof res.pagination === "object", "pagination fehlt");
          },
        },
        {
          name: "1 Fund pro Record (fundExternalId vorhanden)",
          fn: async () => {
            const res = await fetchApi(base, "/api/v1/investments", { limit: "5" });
            for (const inv of res.data) {
              assert(!!inv.fundExternalId, "fundExternalId fehlt");
              assert(!!inv.fundName, "fundName fehlt");
              assert(!!inv.startupExternalId, "startupExternalId fehlt");
              assert(!("investors" in inv), "investors-Array gehört zu funding-rounds");
            }
          },
        },
        {
          name: "role = LEAD | FOLLOW",
          fn: async () => {
            const res = await fetchApi(base, "/api/v1/investments", { limit: "10" });
            for (const inv of res.data) {
              assert(["LEAD", "FOLLOW"].includes(inv.role), `Ungültige role: ${inv.role}`);
            }
          },
        },
        {
          name: "coInvestors ist String-Array",
          fn: async () => {
            const res = await fetchApi(base, "/api/v1/investments", { limit: "5" });
            for (const inv of res.data) {
              assert(Array.isArray(inv.coInvestors), "coInvestors fehlt");
              for (const name of inv.coInvestors) {
                assert(typeof name === "string", "coInvestor ist kein String");
              }
            }
          },
        },
        {
          name: "Composite externalId (fund__round)",
          fn: async () => {
            const res = await fetchApi(base, "/api/v1/investments", { limit: "5" });
            for (const inv of res.data) {
              if (inv.externalId) assert(inv.externalId.includes("__"), `externalId ohne __: ${inv.externalId}`);
            }
          },
        },
        {
          name: "Fund-Filter funktioniert",
          fn: async () => {
            const all = await fetchApi(base, "/api/v1/investments", { limit: "1" });
            if (!all.data[0]?.fundName) return;
            const name = all.data[0].fundName;
            const res = await fetchApi(base, "/api/v1/investments", { fund: name });
            assert(res.data.length > 0, "Kein Ergebnis");
            for (const inv of res.data) {
              assert(inv.fundName.toLowerCase().includes(name.toLowerCase()), `${inv.fundName} enthält nicht "${name}"`);
            }
          },
        },
      ],
    },
    {
      suite: "Funding Rounds",
      tests: [
        {
          name: "Response-Shape { data, pagination }",
          fn: async () => {
            const res = await fetchApi(base, "/api/v1/funding-rounds", { limit: "3" });
            assert(Array.isArray(res.data), "data ist kein Array");
            assert(typeof res.pagination === "object", "pagination fehlt");
          },
        },
        {
          name: "investmentDate statt date (Feldname-Rename)",
          fn: async () => {
            const res = await fetchApi(base, "/api/v1/funding-rounds", { limit: "5" });
            for (const fr of res.data) {
              assert("investmentDate" in fr, "investmentDate fehlt");
              assert(!("date" in fr), "date sollte investmentDate heißen");
            }
          },
        },
        {
          name: "totalRoundSizeUsd statt amountUsd",
          fn: async () => {
            const res = await fetchApi(base, "/api/v1/funding-rounds", { limit: "5" });
            for (const fr of res.data) {
              assert("totalRoundSizeUsd" in fr, "totalRoundSizeUsd fehlt");
              assert(!("amountUsd" in fr), "amountUsd sollte totalRoundSizeUsd heißen");
            }
          },
        },
        {
          name: "investors Array mit LEAD/FOLLOW Rollen",
          fn: async () => {
            const res = await fetchApi(base, "/api/v1/funding-rounds", { limit: "5" });
            for (const fr of res.data) {
              assert(Array.isArray(fr.investors), "investors fehlt");
              for (const inv of fr.investors) {
                assert(["LEAD", "FOLLOW"].includes(inv.role), `Ungültige role: ${inv.role}`);
              }
            }
          },
        },
        {
          name: "Investor-Filter funktioniert",
          fn: async () => {
            const all = await fetchApi(base, "/api/v1/funding-rounds", { limit: "5" });
            const withInv = all.data.find((fr: { investors: unknown[] }) => fr.investors.length > 0);
            if (!withInv) return;
            const invName = withInv.investors[0].name;
            const res = await fetchApi(base, "/api/v1/funding-rounds", { investor: invName.substring(0, 5) });
            assert(res.data.length > 0, "Kein Ergebnis");
          },
        },
        {
          name: "Kein fundExternalId (das ist investments)",
          fn: async () => {
            const res = await fetchApi(base, "/api/v1/funding-rounds", { limit: "3" });
            for (const fr of res.data) {
              assert(!("fundExternalId" in fr), "fundExternalId gehört zu investments");
            }
          },
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// POST handler — runs tests and streams results via SSE
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const base = getBaseUrl(request);
  const suites = buildSuites(base);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const totalTests = suites.reduce((sum, s) => sum + s.tests.length, 0);
      send({ type: "start", totalSuites: suites.length, totalTests });

      const allResults: SuiteResult[] = [];
      let testIndex = 0;

      for (const suite of suites) {
        send({ type: "suite-start", suite: suite.suite, testCount: suite.tests.length });
        const suiteStart = Date.now();
        const results: TestResult[] = [];

        for (const test of suite.tests) {
          const start = Date.now();
          send({ type: "test-start", suite: suite.suite, test: test.name, index: testIndex });

          try {
            await test.fn();
            const duration = Date.now() - start;
            results.push({ name: test.name, status: "pass", duration });
            send({ type: "test-result", suite: suite.suite, test: test.name, status: "pass", duration, index: testIndex });
          } catch (err) {
            const duration = Date.now() - start;
            const error = err instanceof Error ? err.message : String(err);
            results.push({ name: test.name, status: "fail", duration, error });
            send({ type: "test-result", suite: suite.suite, test: test.name, status: "fail", duration, error, index: testIndex });
          }
          testIndex++;
        }

        const suiteResult: SuiteResult = {
          suite: suite.suite,
          tests: results,
          passed: results.filter((r) => r.status === "pass").length,
          failed: results.filter((r) => r.status === "fail").length,
          skipped: results.filter((r) => r.status === "skip").length,
          duration: Date.now() - suiteStart,
        };
        allResults.push(suiteResult);
        send({ type: "suite-done", ...suiteResult });
      }

      const totalPassed = allResults.reduce((s, r) => s + r.passed, 0);
      const totalFailed = allResults.reduce((s, r) => s + r.failed, 0);
      send({ type: "complete", suites: allResults, totalPassed, totalFailed });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
