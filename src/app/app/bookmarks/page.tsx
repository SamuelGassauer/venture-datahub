"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Bookmark, ExternalLink, TrendingUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toggleBookmark } from "@/lib/actions";
import type { ArticleWithFunding } from "@/lib/types";
import { toast } from "sonner";

export default function BookmarksPage() {
  const [articles, setArticles] = useState<ArticleWithFunding[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadBookmarks() {
    const res = await fetch("/api/articles?isBookmarked=true&pageSize=100");
    const data = await res.json();
    setArticles(data.data);
    setLoading(false);
  }

  useEffect(() => {
    loadBookmarks();
  }, []);

  async function handleRemoveBookmark(id: string) {
    await toggleBookmark(id);
    setArticles((prev) => prev.filter((a) => a.id !== id));
    toast.success("Bookmark removed");
  }

  return (
    <div className="flex h-[calc(100vh-1.5rem)] flex-col">
      {/* Header */}
      <div className="glass-status-bar flex items-center justify-between px-4 py-2.5">
        <div>
          <h1 className="text-[17px] font-semibold tracking-[-0.02em] text-foreground/85">Bookmarks</h1>
          <p className="text-[12px] tracking-[-0.01em] text-foreground/40">
            {articles.length} bookmarked articles
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-[14px]" />
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="lg-inset rounded-[16px]">
            <div className="flex flex-col items-center justify-center py-12 text-foreground/40">
              <Bookmark className="h-8 w-8 text-foreground/15 mb-3" />
              <p className="text-[13px] tracking-[-0.01em]">No bookmarked articles yet.</p>
              <p className="text-[12px] tracking-[-0.01em] text-foreground/30 mt-0.5">Bookmark articles from the Feed Timeline.</p>
            </div>
          </div>
        ) : (
          <div className="lg-inset rounded-[16px]">
            {articles.map((article, idx) => (
              <div
                key={article.id}
                className={`lg-inset-row flex items-center gap-4 px-4 py-3 ${idx === 0 ? "rounded-t-[16px]" : ""} ${idx === articles.length - 1 ? "rounded-b-[16px]" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="line-clamp-1 text-[13px] font-semibold tracking-[-0.01em] text-foreground/85">{article.title}</h3>
                    {article.fundingRound && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/8 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 shrink-0" style={{ border: "0.5px solid rgba(16,185,129,0.2)" }}>
                        <TrendingUp className="h-3 w-3" />
                        {article.fundingRound.stage || "Funding"}
                      </span>
                    )}
                  </div>
                  {article.summary && (
                    <p className="mt-1 line-clamp-2 text-[13px] tracking-[-0.01em] text-foreground/45">
                      {article.summary}
                    </p>
                  )}
                  <div className="mt-1 flex items-center gap-3 text-[11px] tracking-[-0.01em] text-foreground/35">
                    <span className="rounded-full bg-foreground/[0.04] px-2 py-0.5 text-[10px] font-medium text-foreground/55" style={{ border: "0.5px solid rgba(0,0,0,0.06)" }}>
                      {article.feed.title}
                    </span>
                    {article.publishedAt && (
                      <span>
                        {formatDistanceToNow(new Date(article.publishedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    className="glass-capsule-btn h-8 w-8 flex items-center justify-center"
                    onClick={() => handleRemoveBookmark(article.id)}
                  >
                    <Bookmark className="h-4 w-4 fill-current text-foreground/70" />
                  </button>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass-capsule-btn h-8 w-8 flex items-center justify-center"
                  >
                    <ExternalLink className="h-4 w-4 text-foreground/40" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
