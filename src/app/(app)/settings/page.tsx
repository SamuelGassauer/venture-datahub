"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSetting } from "@/lib/actions";
import { toast } from "sonner";

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

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-8 w-48 bg-muted rounded" /><div className="h-64 bg-muted rounded" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Sync Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="sync_interval">Sync Interval (minutes)</Label>
            <div className="flex gap-2 mt-1">
              <Input
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
              />
              <Button
                onClick={() =>
                  handleSave(
                    "sync_interval_minutes",
                    settings.sync_interval_minutes || "30"
                  )
                }
              >
                Save
              </Button>
            </div>
          </div>

          <div>
            <Label htmlFor="articles_per_page">Articles per Page</Label>
            <div className="flex gap-2 mt-1">
              <Input
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
              />
              <Button
                onClick={() =>
                  handleSave(
                    "articles_per_page",
                    settings.articles_per_page || "20"
                  )
                }
              >
                Save
              </Button>
            </div>
          </div>

          <div>
            <Label htmlFor="retention_days">Article Retention (days)</Label>
            <div className="flex gap-2 mt-1">
              <Input
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
              />
              <Button
                onClick={() =>
                  handleSave("retention_days", settings.retention_days || "90")
                }
              >
                Save
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Delete all articles and funding data. Feed configurations will be preserved.
            </p>
            <Button variant="destructive" onClick={handleClearArticles}>
              Clear All Articles
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
