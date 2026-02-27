"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { updateSetting } from "@/lib/actions";
import { toast } from "sonner";
import { Settings, Database, Trash2 } from "lucide-react";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setSettings)
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(key: string, value: string) {
    try {
      await updateSetting(key, value);
      setSettings((prev) => ({ ...prev, [key]: value }));
      toast.success("Setting saved");
    } catch {
      toast.error("Failed to save setting");
    }
  }

  async function handleClearArticles() {
    if (!confirm("Delete ALL articles and funding data? This cannot be undone.")) return;
    try {
      const res = await fetch("/api/articles/all", { method: "DELETE" });
      if (res.ok) {
        toast.success("All articles cleared");
      }
    } catch {
      toast.error("Failed to clear articles");
    }
  }

  if (loading) return (
    <div className="flex h-[calc(100vh-1.5rem)] flex-col">
      <div className="glass-status-bar px-4 py-2.5 flex items-center gap-2">
        <Settings className="h-4 w-4 text-foreground/40" />
        <span className="text-[13px] font-semibold text-foreground/85">Settings</span>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="lg-inset rounded-[16px] p-8 animate-pulse">
          <div className="h-6 w-48 bg-foreground/[0.04] rounded-[6px]" />
          <div className="h-40 bg-foreground/[0.04] rounded-[6px] mt-4" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-1.5rem)] flex-col">
      {/* Tier 2: Toolbar */}
      <div className="glass-status-bar px-4 py-2.5 flex items-center gap-2">
        <Settings className="h-4 w-4 text-foreground/40" />
        <span className="text-[13px] font-semibold text-foreground/85">Settings</span>
      </div>

      {/* Tier 3: Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4 max-w-2xl">
        {/* Sync Settings */}
        <div className="lg-inset rounded-[16px]">
          <div className="glass-table-header px-4 py-2.5 rounded-t-[16px]">
            <span className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Sync Settings</span>
          </div>

          {/* Sync Interval */}
          <div className="lg-inset-row px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="sync_interval" className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/85">Sync Interval</Label>
                <p className="text-[12px] text-foreground/45 tracking-[-0.01em]">Minutes between feed syncs</p>
              </div>
              <div className="flex gap-2 items-center">
                <input
                  id="sync_interval"
                  type="number"
                  min={5}
                  max={1440}
                  value={settings.sync_interval_minutes || "30"}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      sync_interval_minutes: e.target.value,
                    }))
                  }
                  className="glass-search-input w-20 px-3 py-1.5 text-[13px] tracking-[-0.01em] text-right tabular-nums"
                />
                <button
                  onClick={() =>
                    handleSave(
                      "sync_interval_minutes",
                      settings.sync_interval_minutes || "30"
                    )
                  }
                  className="apple-btn-blue px-3 py-1.5 text-[13px]"
                >
                  Save
                </button>
              </div>
            </div>
          </div>

          {/* Articles per Page */}
          <div className="lg-inset-row px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="articles_per_page" className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/85">Articles per Page</Label>
                <p className="text-[12px] text-foreground/45 tracking-[-0.01em]">Number of articles shown per page</p>
              </div>
              <div className="flex gap-2 items-center">
                <input
                  id="articles_per_page"
                  type="number"
                  min={5}
                  max={100}
                  value={settings.articles_per_page || "20"}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      articles_per_page: e.target.value,
                    }))
                  }
                  className="glass-search-input w-20 px-3 py-1.5 text-[13px] tracking-[-0.01em] text-right tabular-nums"
                />
                <button
                  onClick={() =>
                    handleSave(
                      "articles_per_page",
                      settings.articles_per_page || "20"
                    )
                  }
                  className="apple-btn-blue px-3 py-1.5 text-[13px]"
                >
                  Save
                </button>
              </div>
            </div>
          </div>

          {/* Retention Days */}
          <div className="lg-inset-row px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="retention_days" className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/85">Article Retention</Label>
                <p className="text-[12px] text-foreground/45 tracking-[-0.01em]">Days to keep articles before cleanup</p>
              </div>
              <div className="flex gap-2 items-center">
                <input
                  id="retention_days"
                  type="number"
                  min={7}
                  max={365}
                  value={settings.retention_days || "90"}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      retention_days: e.target.value,
                    }))
                  }
                  className="glass-search-input w-20 px-3 py-1.5 text-[13px] tracking-[-0.01em] text-right tabular-nums"
                />
                <button
                  onClick={() =>
                    handleSave("retention_days", settings.retention_days || "90")
                  }
                  className="apple-btn-blue px-3 py-1.5 text-[13px]"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Data Management */}
        <div className="lg-inset rounded-[16px]">
          <div className="glass-table-header px-4 py-2.5 rounded-t-[16px]">
            <span className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Data Management</span>
          </div>
          <div className="lg-inset-row px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/85">Clear All Articles</p>
                <p className="text-[12px] text-foreground/45 tracking-[-0.01em]">
                  Delete all articles and funding data. Feed configurations will be preserved.
                </p>
              </div>
              <button
                onClick={handleClearArticles}
                className="glass-capsule-btn flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-red-500 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear All
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
