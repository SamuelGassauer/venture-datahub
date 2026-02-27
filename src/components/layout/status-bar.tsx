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
        "glass-status-bar flex items-center gap-3 px-4 py-1 text-[11px] tracking-[-0.01em] shrink-0 select-none",
        isOk && !hasErrors && "bg-emerald-500/5",
        isOk && hasErrors && "bg-amber-500/5",
        !isOk && "bg-red-500/5",
      )}
    >
      {/* Status icon */}
      <div className="flex items-center gap-1.5">
        {checking ? (
          <Loader2 className="h-3 w-3 animate-spin text-foreground/40" />
        ) : isOk ? (
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
        ) : (
          <XCircle className="h-3 w-3 text-red-500" />
        )}
        <span className={cn(
          "font-medium",
          isOk ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
        )}>
          Claude Haiku
        </span>
      </div>

      {/* Status text */}
      {isOk ? (
        <span className="text-foreground/45">
          <Activity className="inline h-2.5 w-2.5 mr-0.5" />
          {health.latencyMs}ms
        </span>
      ) : (
        <span className="text-red-500 font-medium">
          {health.error}
        </span>
      )}

      {/* Error counter */}
      {hasErrors && (
        <span className={cn(
          "flex items-center gap-1 rounded-[6px] px-1.5 py-0.5",
          health.errorCount >= 5
            ? "bg-red-500/8 text-red-500"
            : "bg-amber-500/8 text-amber-600"
        )}>
          <AlertTriangle className="h-2.5 w-2.5" />
          {health.errorCount} error{health.errorCount !== 1 ? "s" : ""}
          {health.lastErrorAt && (
            <span className="text-foreground/30 ml-0.5">
              (last: {fmtAgo(health.lastErrorAt)})
            </span>
          )}
        </span>
      )}

      {/* Last error message */}
      {hasErrors && health.lastErrorMessage && !health.error && (
        <span className="text-foreground/45 truncate max-w-[300px]" title={health.lastErrorMessage}>
          {health.lastErrorMessage}
        </span>
      )}

      {/* Spacer + last checked */}
      <span className="ml-auto text-foreground/30 tabular-nums">
        checked {fmtAgo(health.checkedAt)}
      </span>
    </div>
  );
}
