"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  Edit2,
  Upload,
  Download,
  RefreshCw,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { createFeed, updateFeed, deleteFeed, importOpml } from "@/lib/actions";
import type { FeedWithCategory, Category } from "@/lib/types";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export default function FeedsPage() {
  const [feeds, setFeeds] = useState<FeedWithCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFeed, setEditingFeed] = useState<FeedWithCategory | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formSiteUrl, setFormSiteUrl] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          `Synced ${data.successful}/${data.total} feeds - ${data.newArticles} new articles, ${data.newFunding} funding rounds`
        );
        loadFeeds();
      } else {
        toast.error(data.error || "Sync failed");
      }
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function loadFeeds() {
    const res = await fetch("/api/feeds");
    const data = await res.json();
    setFeeds(data);
    const cats = new Map<string, Category>();
    data.forEach((f: FeedWithCategory) => {
      if (f.category) cats.set(f.category.id, f.category);
    });
    setCategories(Array.from(cats.values()));
    setLoading(false);
  }

  useEffect(() => {
    loadFeeds();
  }, []);

  function openAddDialog() {
    setEditingFeed(null);
    setFormTitle("");
    setFormUrl("");
    setFormSiteUrl("");
    setFormCategoryId("");
    setDialogOpen(true);
  }

  function openEditDialog(feed: FeedWithCategory) {
    setEditingFeed(feed);
    setFormTitle(feed.title);
    setFormUrl(feed.url);
    setFormSiteUrl(feed.siteUrl || "");
    setFormCategoryId(feed.categoryId || "");
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const data = {
      title: formTitle,
      url: formUrl,
      siteUrl: formSiteUrl || undefined,
      categoryId: formCategoryId || undefined,
    };

    try {
      if (editingFeed) {
        await updateFeed(editingFeed.id, data);
        toast.success("Feed updated");
      } else {
        await createFeed(data);
        toast.success("Feed added");
      }
      setDialogOpen(false);
      setEditingFeed(null);
      loadFeeds();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save feed");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this feed and all its articles?")) return;
    try {
      await deleteFeed(id);
      toast.success("Feed deleted");
      loadFeeds();
    } catch {
      toast.error("Failed to delete feed");
    }
  }

  async function handleToggleActive(feed: FeedWithCategory) {
    await updateFeed(feed.id, { isActive: !feed.isActive });
    loadFeeds();
  }

  async function handleOpmlImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    try {
      const result = await importOpml(text);
      toast.success(`Imported ${result.imported} feeds`);
      loadFeeds();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "OPML import failed");
    }
    e.target.value = "";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Manage Feeds</h1>
        <div className="flex gap-2">
          <label>
            <input
              type="file"
              accept=".opml,.xml"
              className="hidden"
              onChange={handleOpmlImport}
            />
            <Button variant="outline" size="sm" asChild>
              <span>
                <Upload className="mr-1 h-4 w-4" /> Import OPML
              </span>
            </Button>
          </label>
          <Button variant="outline" size="sm" asChild>
            <a href="/api/feeds/opml" download>
              <Download className="mr-1 h-4 w-4" /> Export OPML
            </a>
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync All Feeds"}
          </Button>
          <Button size="sm" variant="outline" onClick={openAddDialog}>
            <Plus className="mr-1 h-4 w-4" /> Add Feed
          </Button>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        {loading ? "Loading..." : `${feeds.length} feeds configured`}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {feeds.map((feed) => (
            <Card key={feed.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{feed.title}</h3>
                    {feed.category && (
                      <Badge
                        variant="outline"
                        style={{ borderColor: feed.category.color }}
                      >
                        {feed.category.name}
                      </Badge>
                    )}
                    {feed.isActive ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {feed.url}
                  </p>
                  <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                    <span>{feed.articleCount} articles</span>
                    {feed.lastSyncAt && (
                      <span>
                        Last sync:{" "}
                        {formatDistanceToNow(new Date(feed.lastSyncAt), {
                          addSuffix: true,
                        })}
                      </span>
                    )}
                    {feed.lastSyncError && (
                      <span className="text-red-500 truncate max-w-[300px]">
                        Error: {feed.lastSyncError}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToggleActive(feed)}
                    title={feed.isActive ? "Disable" : "Enable"}
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${
                        feed.isActive ? "text-green-500" : "text-muted-foreground"
                      }`}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditDialog(feed)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(feed.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Feed Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingFeed ? "Edit Feed" : "Add New Feed"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="feed-title">Title</Label>
              <Input
                id="feed-title"
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. TechCrunch"
              />
            </div>
            <div>
              <Label htmlFor="feed-url">Feed URL</Label>
              <Input
                id="feed-url"
                type="url"
                required
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://example.com/feed/"
              />
            </div>
            <div>
              <Label htmlFor="feed-site-url">Site URL (optional)</Label>
              <Input
                id="feed-site-url"
                type="url"
                value={formSiteUrl}
                onChange={(e) => setFormSiteUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div>
              <Label htmlFor="feed-category">Category</Label>
              <select
                id="feed-category"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={formCategoryId}
                onChange={(e) => setFormCategoryId(e.target.value)}
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" className="w-full">
              {editingFeed ? "Update" : "Add"} Feed
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
