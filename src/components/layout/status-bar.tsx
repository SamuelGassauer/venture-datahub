"use client";

import { useEffect, useState, useCallback } from "react";
import { Activity, AlertTriangle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type HealthStatus = {
  ok: boolean;
  latencyMs: number;
  error: string | null;
  checkedAt: string;
  errorCount: number;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
};

function fmtAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export function StatusBar() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const checkHealth = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        setHealth(await res.json());
      }
    } catch {
      // Network error
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 60_000); // poll every 60s
    return () => clearInterval(interval);
  }, [checkHealth]);

  if (!health) return null;

  const isOk = health.ok;
  const hasErrors = health.errorCount > 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-1 text-[11px] border-b shrink-0 select-none",
        isOk && !hasErrors && "bg-emerald-500/5 border-emerald-500/20",
        isOk && hasErrors && "bg-yellow-500/5 border-yellow-500/20",
        !isOk && "bg-red-500/5 border-red-500/20",
      )}
    >
      {/* Status icon */}
      <div className="flex items-center gap-1.5">
        {checking ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : isOk ? (
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
        ) : (
          <XCircle className="h-3 w-3 text-red-500" />
        )}
        <span className={cn(
          "font-medium",
          isOk ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
        )}>
          Claude Haiku
        </span>
      </div>

      {/* Status text */}
      {isOk ? (
        <span className="text-muted-foreground">
          <Activity className="inline h-2.5 w-2.5 mr-0.5" />
          {health.latencyMs}ms
        </span>
      ) : (
        <span className="text-red-600 dark:text-red-400 font-medium">
          {health.error}
        </span>
      )}

      {/* Error counter */}
      {hasErrors && (
        <span className={cn(
          "flex items-center gap-1 rounded px-1.5 py-0.5",
          health.errorCount >= 5
            ? "bg-red-500/10 text-red-700 dark:text-red-400"
            : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
        )}>
          <AlertTriangle className="h-2.5 w-2.5" />
          {health.errorCount} error{health.errorCount !== 1 ? "s" : ""}
          {health.lastErrorAt && (
            <span className="text-muted-foreground ml-0.5">
              (last: {fmtAgo(health.lastErrorAt)})
            </span>
          )}
        </span>
      )}

      {/* Last error message */}
      {hasErrors && health.lastErrorMessage && !health.error && (
        <span className="text-muted-foreground truncate max-w-[300px]" title={health.lastErrorMessage}>
          {health.lastErrorMessage}
        </span>
      )}

      {/* Spacer + last checked */}
      <span className="ml-auto text-muted-foreground/60 tabular-nums">
        checked {fmtAgo(health.checkedAt)}
      </span>
    </div>
  );
}
