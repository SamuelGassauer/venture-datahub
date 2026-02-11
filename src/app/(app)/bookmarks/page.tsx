"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Bookmarks</h1>
      <p className="text-sm text-muted-foreground">
        {articles.length} bookmarked articles
      </p>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No bookmarked articles yet. Bookmark articles from the Feed Timeline.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {articles.map((article) => (
            <Card key={article.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="line-clamp-1 font-medium">{article.title}</h3>
                    {article.fundingRound && (
                      <Badge variant="default" className="gap-1 shrink-0">
                        <TrendingUp className="h-3 w-3" />
                        {article.fundingRound.stage || "Funding"}
                      </Badge>
                    )}
                  </div>
                  {article.summary && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {article.summary}
                    </p>
                  )}
                  <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs">
                      {article.feed.title}
                    </Badge>
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
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveBookmark(article.id)}
                  >
                    <Bookmark className="h-4 w-4 fill-current" />
                  </Button>
                  <Button variant="ghost" size="icon" asChild>
                    <a href={article.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
