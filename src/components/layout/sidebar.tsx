"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Newspaper,
  Rss,
  TrendingUp,
  Settings,
  RefreshCw,
  GitFork,
  BookOpen,
  Share2,
  Building2,
  Users,
  CircleDollarSign,
  FileText,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "Incoming",
    items: [
      { href: "/feed", label: "Feed Timeline", icon: Newspaper },
      { href: "/feeds", label: "Manage Feeds", icon: Rss },
      { href: "/funding", label: "Funding Rounds", icon: TrendingUp },
    ],
  },
  {
    label: "Knowledge Graph",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/companies", label: "Companies", icon: Building2 },
      { href: "/investors", label: "Investors", icon: Users },
      { href: "/graph/funding-rounds", label: "Funding Rounds", icon: CircleDollarSign },
      { href: "/graph", label: "Graph Explorer", icon: Share2, exact: true },
    ],
  },
  {
    label: "Outgoing",
    items: [
      { href: "/posts", label: "Beitr\u00E4ge", icon: FileText },
    ],
  },
  {
    label: "Reference",
    items: [
      { href: "/ontology", label: "Ontology", icon: GitFork },
      { href: "/graphrag", label: "GraphRAG Guide", icon: BookOpen },
      { href: "/algorithms", label: "Algorithmen", icon: Shield },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          `Synced ${data.successful}/${data.total} feeds, ${data.newArticles} new articles`
        );
      } else {
        toast.error(data.error || "Sync failed");
      }
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <TrendingUp className="h-5 w-5 text-primary" />
          <span>EU Funding Tracker</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-3">
            <div className="mb-1 px-3 text-[10px] uppercase tracking-wider text-muted-foreground">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    pathname === item.href || (!item.exact && pathname?.startsWith(item.href + "/"))
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t p-3 space-y-2">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            pathname === "/settings"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={handleSync}
          disabled={syncing}
        >
          <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
          {syncing ? "Syncing..." : "Sync All Feeds"}
        </Button>
      </div>
    </aside>
  );
}
