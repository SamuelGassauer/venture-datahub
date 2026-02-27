"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
    <div className="flex h-[calc(100vh-1.5rem)] flex-col">
      {/* Toolbar */}
      <div className="glass-status-bar flex items-center justify-between px-4 py-2.5">
        <div>
          <h1 className="text-[17px] font-semibold tracking-[-0.02em] text-foreground/85">Manage Feeds</h1>
          <p className="text-[12px] tracking-[-0.01em] text-foreground/40">
            {loading ? "Loading..." : `${feeds.length} feeds configured`}
          </p>
        </div>
        <div className="flex gap-2">
          <label>
            <input
              type="file"
              accept=".opml,.xml"
              className="hidden"
              onChange={handleOpmlImport}
            />
            <span className="glass-capsule-btn h-8 px-3 text-[13px] tracking-[-0.01em] inline-flex items-center gap-1.5 cursor-pointer">
              <Upload className="h-3.5 w-3.5" /> Import OPML
            </span>
          </label>
          <a
            href="/api/feeds/opml"
            download
            className="glass-capsule-btn h-8 px-3 text-[13px] tracking-[-0.01em] inline-flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" /> Export OPML
          </a>
          <button
            className="apple-btn-blue h-8 px-3 text-[13px] tracking-[-0.01em] inline-flex items-center gap-1.5 disabled:opacity-50"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync All Feeds"}
          </button>
          <button
            className="glass-capsule-btn h-8 px-3 text-[13px] tracking-[-0.01em] inline-flex items-center gap-1.5"
            onClick={openAddDialog}
          >
            <Plus className="h-3.5 w-3.5" /> Add Feed
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-[14px] bg-foreground/[0.04]" />
            ))}
          </div>
        ) : (
          <div className="lg-inset rounded-[16px]">
            {feeds.map((feed, idx) => (
              <div
                key={feed.id}
                className={`lg-inset-row flex items-center justify-between px-4 py-3 ${idx === 0 ? "rounded-t-[16px]" : ""} ${idx === feeds.length - 1 ? "rounded-b-[16px]" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/85">{feed.title}</h3>
                    {feed.category && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          border: `0.5px solid ${feed.category.color}`,
                          color: feed.category.color,
                          background: `${feed.category.color}10`,
                        }}
                      >
                        {feed.category.name}
                      </span>
                    )}
                    {feed.isActive ? (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                    )}
                  </div>
                  <p className="truncate text-[12px] tracking-[-0.01em] text-foreground/40">
                    {feed.url}
                  </p>
                  <div className="mt-1 flex gap-3 text-[11px] tracking-[-0.01em] text-foreground/35">
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
                  <button
                    className="glass-capsule-btn h-7 w-7 flex items-center justify-center"
                    onClick={() => handleToggleActive(feed)}
                    title={feed.isActive ? "Disable" : "Enable"}
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${
                        feed.isActive ? "text-emerald-500" : "text-foreground/40"
                      }`}
                    />
                  </button>
                  <button
                    className="glass-capsule-btn h-7 w-7 flex items-center justify-center"
                    onClick={() => openEditDialog(feed)}
                  >
                    <Edit2 className="h-3.5 w-3.5 text-foreground/40" />
                  </button>
                  <button
                    className="glass-capsule-btn h-7 w-7 flex items-center justify-center"
                    onClick={() => handleDelete(feed.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Feed Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-[17px] font-semibold tracking-[-0.02em] text-foreground/85">
              {editingFeed ? "Edit Feed" : "Add New Feed"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="feed-title" className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">Title</Label>
              <input
                id="feed-title"
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. TechCrunch"
                className="glass-search-input mt-1 h-9 w-full px-3 text-[13px] tracking-[-0.01em]"
              />
            </div>
            <div>
              <Label htmlFor="feed-url" className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">Feed URL</Label>
              <input
                id="feed-url"
                type="url"
                required
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://example.com/feed/"
                className="glass-search-input mt-1 h-9 w-full px-3 text-[13px] tracking-[-0.01em]"
              />
            </div>
            <div>
              <Label htmlFor="feed-site-url" className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">Site URL (optional)</Label>
              <input
                id="feed-site-url"
                type="url"
                value={formSiteUrl}
                onChange={(e) => setFormSiteUrl(e.target.value)}
                placeholder="https://example.com"
                className="glass-search-input mt-1 h-9 w-full px-3 text-[13px] tracking-[-0.01em]"
              />
            </div>
            <div>
              <Label htmlFor="feed-category" className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">Category</Label>
              <select
                id="feed-category"
                className="glass-search-input mt-1 h-9 w-full px-3 text-[13px] tracking-[-0.01em]"
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
            <button type="submit" className="apple-btn-blue h-9 w-full text-[13px] tracking-[-0.01em]">
              {editingFeed ? "Update" : "Add"} Feed
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
