"use client";

import { useState, useRef, useCallback } from "react";
import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCcw,
  FlaskConical,
  Clock,
  ChevronDown,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TestResult = {
  name: string;
  status: "pass" | "fail" | "skip" | "running";
  duration?: number;
  error?: string;
};

type SuiteState = {
  suite: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  duration?: number;
  expanded: boolean;
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ApiTestsPage() {
  const [running, setRunning] = useState(false);
  const [suites, setSuites] = useState<SuiteState[]>([]);
  const [totalPassed, setTotalPassed] = useState(0);
  const [totalFailed, setTotalFailed] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [done, setDone] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef(0);

  const handleEvent = useCallback((evt: Record<string, unknown>) => {
    switch (evt.type) {
      case "suite-start":
        setSuites((prev) => [
          ...prev,
          {
            suite: evt.suite as string,
            tests: [],
            passed: 0,
            failed: 0,
            expanded: true,
          },
        ]);
        break;

      case "test-start":
        setSuites((prev) =>
          prev.map((s) =>
            s.suite === evt.suite
              ? {
                  ...s,
                  tests: [...s.tests, { name: evt.test as string, status: "running" as const }],
                }
              : s
          )
        );
        break;

      case "test-result":
        setSuites((prev) =>
          prev.map((s) =>
            s.suite === evt.suite
              ? {
                  ...s,
                  tests: s.tests.map((t) =>
                    t.name === evt.test
                      ? {
                          ...t,
                          status: evt.status as "pass" | "fail",
                          duration: evt.duration as number,
                          error: evt.error as string | undefined,
                        }
                      : t
                  ),
                }
              : s
          )
        );
        break;

      case "suite-done":
        setSuites((prev) =>
          prev.map((s) =>
            s.suite === evt.suite
              ? {
                  ...s,
                  passed: evt.passed as number,
                  failed: evt.failed as number,
                  duration: evt.duration as number,
                  expanded: (evt.failed as number) > 0,
                }
              : s
          )
        );
        break;

      case "complete":
        setTotalPassed(evt.totalPassed as number);
        setTotalFailed(evt.totalFailed as number);
        break;
    }
  }, []);

  const runTests = useCallback(async () => {
    setRunning(true);
    setDone(false);
    setSuites([]);
    setTotalPassed(0);
    setTotalFailed(0);
    setTotalTime(0);
    startTimeRef.current = Date.now();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/admin/api-tests", {
        method: "POST",
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            handleEvent(evt);
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Test stream error:", err);
      }
    } finally {
      setRunning(false);
      setDone(true);
      setTotalTime(Date.now() - startTimeRef.current);
    }
  }, [handleEvent]);

  const toggleSuite = (suite: string) => {
    setSuites((prev) =>
      prev.map((s) => (s.suite === suite ? { ...s, expanded: !s.expanded } : s))
    );
  };

  const total = totalPassed + totalFailed;
  const allGreen = done && totalFailed === 0 && total > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glass-status-bar px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <FlaskConical className="h-4 w-4 text-foreground/40" />
          <span className="text-[15px] tracking-[-0.02em] font-semibold text-foreground/85">
            API Tests
          </span>
          {done && (
            <span className="text-[12px] text-foreground/35 ml-2">
              {total} Tests in {(totalTime / 1000).toFixed(1)}s
            </span>
          )}
        </div>
        <button
          onClick={runTests}
          disabled={running}
          className="apple-btn-blue px-4 py-1.5 text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Läuft...
            </>
          ) : (
            <>
              {done ? <RotateCcw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {done ? "Erneut starten" : "Tests starten"}
            </>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {suites.length === 0 && !running && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-foreground/20">
            <FlaskConical className="h-12 w-12" />
            <p className="text-[13px]">Klicke &quot;Tests starten&quot; um die API-Testsuite auszuführen</p>
            <p className="text-[11px] text-foreground/15">
              Testet alle v1 Endpoints: Investors, Startups, Investments, Funding Rounds, Meta
            </p>
          </div>
        )}

        {/* Summary Banner */}
        {done && (
          <div
            className={`rounded-[14px] px-4 py-3 mb-4 flex items-center gap-3 ${
              allGreen
                ? "bg-emerald-500/8 border border-emerald-500/15"
                : "bg-red-500/8 border border-red-500/15"
            }`}
          >
            {allGreen ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            <div>
              <span
                className={`text-[15px] font-semibold ${allGreen ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}
              >
                {allGreen ? "Alle Tests bestanden" : `${totalFailed} Test${totalFailed > 1 ? "s" : ""} fehlgeschlagen`}
              </span>
              <span className="text-[12px] text-foreground/35 ml-3">
                {totalPassed} passed · {totalFailed} failed · {(totalTime / 1000).toFixed(1)}s
              </span>
            </div>
          </div>
        )}

        {/* Suites */}
        <div className="flex flex-col gap-2">
          {suites.map((suite) => {
            const suiteRunning = suite.tests.some((t) => t.status === "running");
            const suiteDone = suite.duration !== undefined;
            const suiteAllGreen = suiteDone && suite.failed === 0;

            return (
              <div key={suite.suite} className="lg-inset rounded-[14px]">
                {/* Suite Header */}
                <button
                  onClick={() => toggleSuite(suite.suite)}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-foreground/[0.02] transition-colors"
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-foreground/25 transition-transform ${
                      !suite.expanded ? "-rotate-90" : ""
                    }`}
                  />

                  {suiteRunning ? (
                    <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
                  ) : suiteAllGreen ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : suiteDone ? (
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                  ) : (
                    <div className="h-3.5 w-3.5 rounded-full border border-foreground/10" />
                  )}

                  <span className="text-[13px] font-semibold text-foreground/70 flex-1 text-left">
                    {suite.suite}
                  </span>

                  {suiteDone && (
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-emerald-500">{suite.passed} passed</span>
                      {suite.failed > 0 && (
                        <span className="text-red-500">{suite.failed} failed</span>
                      )}
                      <span className="text-foreground/20 flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        {(suite.duration! / 1000).toFixed(1)}s
                      </span>
                    </div>
                  )}
                </button>

                {/* Tests */}
                {suite.expanded && (
                  <div className="border-t border-foreground/[0.04]">
                    {suite.tests.map((test) => (
                      <div
                        key={test.name}
                        className="flex items-start gap-2.5 px-4 py-2 lg-inset-row"
                      >
                        {test.status === "running" ? (
                          <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin mt-0.5 shrink-0" />
                        ) : test.status === "pass" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        ) : test.status === "fail" ? (
                          <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border border-foreground/10 mt-0.5 shrink-0" />
                        )}

                        <div className="flex-1 min-w-0">
                          <span className="text-[12px] text-foreground/55">{test.name}</span>
                          {test.error && (
                            <div className="mt-1 text-[11px] font-mono text-red-500/80 bg-red-500/[0.06] rounded-[6px] px-2 py-1">
                              {test.error}
                            </div>
                          )}
                        </div>

                        {test.duration !== undefined && (
                          <span className="text-[10px] text-foreground/20 shrink-0 mt-0.5">
                            {test.duration}ms
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
