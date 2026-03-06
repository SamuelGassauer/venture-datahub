"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  KeyRound,
  Plus,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  BarChart3,
  ShieldCheck,
  ShieldOff,
  Clock,
} from "lucide-react";
import { Label } from "@/components/ui/label";

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  rateLimit: number;
  isActive: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  requestCount: number;
  createdBy: { name: string | null; email: string };
  createdAt: string;
};

type UsageDay = { day: string; count: number };
type UsageLog = {
  id: string;
  endpoint: string;
  method: string;
  status: number;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

const SCOPE_LABELS: Record<string, string> = {
  "funding-rounds": "Funding Rounds",
  companies: "Companies",
  "fund-events": "Fund Events",
  "value-indicators": "Value Indicators",
  "data-provider": "Data Provider API",
  "*": "Alle Endpoints",
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [availableScopes, setAvailableScopes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [usageKeyId, setUsageKeyId] = useState<string | null>(null);
  const [usageData, setUsageData] = useState<{ logs: UsageLog[]; dailyCounts: UsageDay[] } | null>(null);
  const [form, setForm] = useState({
    name: "",
    scopes: ["funding-rounds"] as string[],
    rateLimit: 100,
    expiresAt: "",
  });

  async function fetchKeys() {
    const res = await fetch("/api/admin/api-keys");
    const data = await res.json();
    setKeys(data.keys);
    setAvailableScopes(data.availableScopes);
    setLoading(false);
  }

  useEffect(() => {
    fetchKeys();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        scopes: form.scopes,
        rateLimit: form.rateLimit,
        expiresAt: form.expiresAt || null,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setCreatedKey(data.rawKey);
      setShowKey(true);
      setShowCreate(false);
      setForm({ name: "", scopes: ["funding-rounds"], rateLimit: 100, expiresAt: "" });
      fetchKeys();
      toast.success("API Key erstellt");
    } else {
      toast.error(data.error || "Fehler beim Erstellen");
    }
  }

  async function handleToggleActive(key: ApiKeyRow) {
    const res = await fetch(`/api/admin/api-keys/${key.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !key.isActive }),
    });
    if (res.ok) {
      toast.success(key.isActive ? "Key deaktiviert" : "Key aktiviert");
      fetchKeys();
    }
  }

  async function handleDelete(key: ApiKeyRow) {
    if (!confirm(`API Key "${key.name}" (${key.prefix}...) unwiderruflich löschen?`)) return;
    const res = await fetch(`/api/admin/api-keys/${key.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Key gelöscht");
      if (usageKeyId === key.id) {
        setUsageKeyId(null);
        setUsageData(null);
      }
      fetchKeys();
    }
  }

  async function loadUsage(keyId: string) {
    if (usageKeyId === keyId) {
      setUsageKeyId(null);
      setUsageData(null);
      return;
    }
    setUsageKeyId(keyId);
    const res = await fetch(`/api/admin/api-keys/${keyId}/usage?days=7`);
    const data = await res.json();
    setUsageData(data);
  }

  function toggleScope(scope: string) {
    setForm((prev) => {
      const has = prev.scopes.includes(scope);
      if (scope === "*") return { ...prev, scopes: has ? [] : ["*"] };
      const next = has
        ? prev.scopes.filter((s) => s !== scope && s !== "*")
        : [...prev.scopes.filter((s) => s !== "*"), scope];
      return { ...prev, scopes: next };
    });
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Kopiert");
  }

  function fmtDate(d: string | null) {
    if (!d) return "\u2014";
    return new Date(d).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-1.5rem)] flex-col">
        <div className="glass-status-bar px-4 py-2.5 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-foreground/40" />
          <span className="text-[13px] font-semibold text-foreground/85">API Keys</span>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <div className="lg-inset rounded-[16px] p-8">
            <p className="text-[13px] text-foreground/45">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-1.5rem)] flex-col">
      {/* Toolbar */}
      <div className="glass-status-bar px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-foreground/40" />
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-foreground/85">API Keys</span>
          <span className="text-[11px] text-foreground/35 tabular-nums">{keys.length} keys</span>
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); setCreatedKey(null); }}
          className="apple-btn-blue flex items-center gap-1.5 px-3 py-1.5 text-[13px]"
        >
          <Plus className="h-3.5 w-3.5" />
          Neuer API Key
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Created key alert */}
        {createdKey && (
          <div className="lg-inset rounded-[16px] border-l-4 border-emerald-500 p-4 space-y-2">
            <p className="text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">
              API Key erstellt — jetzt kopieren!
            </p>
            <p className="text-[12px] text-foreground/45">
              Dieser Key wird nur einmal angezeigt. Speichere ihn sicher ab.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-[10px] bg-foreground/[0.04] px-3 py-2 font-mono text-[12px] text-foreground/70 select-all">
                {showKey ? createdKey : createdKey.slice(0, 12) + "•".repeat(32)}
              </code>
              <button
                onClick={() => setShowKey(!showKey)}
                className="glass-capsule-btn p-2"
                title={showKey ? "Verstecken" : "Anzeigen"}
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => copyToClipboard(createdKey)}
                className="glass-capsule-btn p-2"
                title="Kopieren"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Create form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="lg-inset rounded-[16px] p-4 space-y-4">
            <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-foreground/85">Neuen API Key erstellen</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                  Name / Beschreibung
                </Label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder='z.B. "inventure-2.0 production"'
                  required
                  className="glass-search-input w-full px-3 py-2 text-[13px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                  Rate Limit (pro Stunde)
                </Label>
                <input
                  type="number"
                  value={form.rateLimit}
                  onChange={(e) => setForm({ ...form, rateLimit: parseInt(e.target.value) || 100 })}
                  min={1}
                  max={10000}
                  className="glass-search-input w-full px-3 py-2 text-[13px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                  Scopes (Berechtigungen)
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {availableScopes.map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => toggleScope(scope)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        form.scopes.includes(scope)
                          ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                          : "bg-foreground/[0.04] text-foreground/45 hover:bg-foreground/[0.08]"
                      }`}
                    >
                      {SCOPE_LABELS[scope] || scope}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                  Ablaufdatum (optional)
                </Label>
                <input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                  className="glass-search-input w-full px-3 py-2 text-[13px]"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="apple-btn-blue px-4 py-1.5 text-[13px]">
                Key generieren
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="glass-capsule-btn px-3 py-1.5 text-[13px]"
              >
                Abbrechen
              </button>
            </div>
          </form>
        )}

        {/* Keys table */}
        <div className="lg-inset rounded-[16px]">
          {keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <KeyRound className="h-8 w-8 text-foreground/15" />
              <p className="text-[13px] text-foreground/40">Noch keine API Keys vorhanden.</p>
            </div>
          ) : (
            <table className="w-full text-[13px] tracking-[-0.01em]">
              <thead>
                <tr className="glass-table-header">
                  <th className="px-4 py-2.5 text-left text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Name</th>
                  <th className="px-4 py-2.5 text-left text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Key</th>
                  <th className="px-4 py-2.5 text-left text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Scopes</th>
                  <th className="px-4 py-2.5 text-left text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Limit</th>
                  <th className="px-4 py-2.5 text-left text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Status</th>
                  <th className="px-4 py-2.5 text-left text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Nutzung</th>
                  <th className="px-4 py-2.5 text-left text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Zuletzt</th>
                  <th className="px-4 py-2.5 text-right text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <>
                    <tr key={key.id} className="lg-inset-table-row">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-[13px] font-semibold text-foreground/85">{key.name}</p>
                          <p className="text-[11px] text-foreground/35">
                            von {key.createdBy.name || key.createdBy.email}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <code className="rounded-[6px] bg-foreground/[0.04] px-2 py-0.5 font-mono text-[11px] text-foreground/55">
                          {key.prefix}...
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {key.scopes.map((s) => (
                            <span
                              key={s}
                              className="rounded-full bg-blue-500/8 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400"
                            >
                              {SCOPE_LABELS[s] || s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-foreground/45 tabular-nums">
                        {key.rateLimit}/h
                      </td>
                      <td className="px-4 py-3">
                        {key.isActive ? (
                          key.expiresAt && new Date(key.expiresAt) < new Date() ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/8 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                              <Clock className="h-3 w-3" /> Abgelaufen
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/8 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                              <ShieldCheck className="h-3 w-3" /> Aktiv
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/8 px-2 py-0.5 text-[10px] font-medium text-red-500">
                            <ShieldOff className="h-3 w-3" /> Deaktiviert
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-foreground/45">
                        {key.requestCount.toLocaleString()} req
                      </td>
                      <td className="px-4 py-3 text-foreground/40 whitespace-nowrap">
                        {fmtDate(key.lastUsedAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => loadUsage(key.id)}
                            className={`glass-capsule-btn px-2 py-1 ${usageKeyId === key.id ? "bg-blue-500/10 text-blue-600" : ""}`}
                            title="Usage"
                          >
                            <BarChart3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(key)}
                            className="glass-capsule-btn px-2.5 py-1 text-[12px]"
                          >
                            {key.isActive ? "Deaktivieren" : "Aktivieren"}
                          </button>
                          <button
                            onClick={() => handleDelete(key)}
                            className="glass-capsule-btn px-2 py-1 text-red-500 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {/* Usage panel */}
                    {usageKeyId === key.id && usageData && (
                      <tr key={`${key.id}-usage`}>
                        <td colSpan={8} className="px-4 py-3 bg-foreground/[0.02]">
                          <div className="space-y-3">
                            {/* Daily chart */}
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.04em] font-medium text-foreground/35 mb-2">
                                Requests / Tag (letzte 7 Tage)
                              </p>
                              {usageData.dailyCounts.length === 0 ? (
                                <p className="text-[12px] text-foreground/30">Keine Nutzung</p>
                              ) : (
                                <div className="flex items-end gap-1 h-16">
                                  {usageData.dailyCounts
                                    .slice()
                                    .reverse()
                                    .map((d) => {
                                      const max = Math.max(...usageData.dailyCounts.map((x) => x.count), 1);
                                      const pct = (d.count / max) * 100;
                                      return (
                                        <div key={d.day} className="flex flex-col items-center gap-0.5 flex-1" title={`${d.day}: ${d.count} req`}>
                                          <span className="text-[10px] tabular-nums text-foreground/35">{d.count}</span>
                                          <div
                                            className="w-full rounded-[4px] bg-blue-500/20"
                                            style={{ height: `${Math.max(pct, 4)}%` }}
                                          />
                                          <span className="text-[9px] text-foreground/25">{d.day.slice(5)}</span>
                                        </div>
                                      );
                                    })}
                                </div>
                              )}
                            </div>
                            {/* Recent logs */}
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.04em] font-medium text-foreground/35 mb-2">
                                Letzte Anfragen
                              </p>
                              {usageData.logs.length === 0 ? (
                                <p className="text-[12px] text-foreground/30">Keine Logs</p>
                              ) : (
                                <div className="max-h-48 overflow-auto">
                                  <table className="w-full text-[11px]">
                                    <thead>
                                      <tr>
                                        <th className="text-left px-2 py-1 text-foreground/30">Zeit</th>
                                        <th className="text-left px-2 py-1 text-foreground/30">Methode</th>
                                        <th className="text-left px-2 py-1 text-foreground/30">Endpoint</th>
                                        <th className="text-left px-2 py-1 text-foreground/30">Status</th>
                                        <th className="text-left px-2 py-1 text-foreground/30">IP</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {usageData.logs.slice(0, 20).map((log) => (
                                        <tr key={log.id} className="border-t border-foreground/[0.04]">
                                          <td className="px-2 py-1 text-foreground/40 whitespace-nowrap">{fmtDate(log.createdAt)}</td>
                                          <td className="px-2 py-1">
                                            <span className="rounded-[4px] bg-emerald-500/8 px-1.5 py-0.5 text-[10px] font-mono text-emerald-600">
                                              {log.method}
                                            </span>
                                          </td>
                                          <td className="px-2 py-1 font-mono text-foreground/55">{log.endpoint}</td>
                                          <td className="px-2 py-1 tabular-nums text-foreground/45">{log.status}</td>
                                          <td className="px-2 py-1 font-mono text-foreground/30">{log.ip || "\u2014"}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
