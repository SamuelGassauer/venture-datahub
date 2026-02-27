"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Newspaper,
  Rss,
  Settings,
  RefreshCw,
  GitFork,
  BookOpen,
  Share2,
  Building2,
  Users,
  FileText,
  Shield,
  Landmark,
  Orbit,
  Handshake,
  BarChart3,
  Flame,
  Activity,
  ChevronRight,
  ChevronDown,
  FileQuestion,
  LogOut,
  UserCog,
  Code2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};
type NavGroup = { label: string; items: NavItem[]; adminOnly?: boolean };

const navGroups: NavGroup[] = [
  {
    label: "Monitor",
    adminOnly: true,
    items: [
      { href: "/feed", label: "News Feed", icon: Newspaper },
      { href: "/feeds", label: "Feed Sources", icon: Rss },
    ],
  },
  {
    label: "Pipeline",
    adminOnly: true,
    items: [
      { href: "/funding", label: "Deal Flow", icon: Flame },
      { href: "/fund-events", label: "Fund Activity", icon: Landmark },
      { href: "/company-value-indicator", label: "KPI Signals", icon: Activity },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/companies", label: "Companies", icon: Building2 },
      { href: "/investors", label: "Investors", icon: Users },
      { href: "/graph/funding-rounds", label: "Deals", icon: Handshake },
      { href: "/graph/fund-closings", label: "Funds", icon: Landmark },
      { href: "/graph/valuations", label: "Valuations", icon: BarChart3 },
      { href: "/graph", label: "Explorer", icon: Share2, exact: true },
    ],
  },
  {
    label: "Publish",
    adminOnly: true,
    items: [{ href: "/posts", label: "Posts", icon: FileText }],
  },
  {
    label: "Admin",
    adminOnly: true,
    items: [{ href: "/admin/users", label: "Users", icon: UserCog }],
  },
];

const docsItems: NavItem[] = [
  { href: "/ontology", label: "Ontology", icon: GitFork },
  { href: "/graphrag", label: "GraphRAG", icon: BookOpen },
  { href: "/algorithms", label: "Algorithms", icon: Shield },
  { href: "/docs/api", label: "API", icon: Code2 },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [syncing, setSyncing] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  const isAdmin = session?.user?.role === "admin";

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

  function isActive(item: NavItem) {
    return (
      pathname === item.href ||
      (!item.exact && pathname?.startsWith(item.href + "/"))
    );
  }

  const linkClasses = (item: NavItem) =>
    cn(
      "flex items-center gap-3 rounded-[8px] px-3 py-2 text-[13px] font-medium transition-colors",
      isActive(item)
        ? "bg-foreground/[0.08] text-foreground/85"
        : "text-foreground/55 hover:bg-foreground/[0.06] hover:text-foreground/70"
    );

  const visibleGroups = navGroups.filter(
    (group) => !group.adminOnly || isAdmin
  );

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-foreground/[0.08] bg-foreground/[0.02] backdrop-blur-xl">
      <div className="flex h-14 items-center border-b border-foreground/[0.08] px-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-semibold"
        >
          <Orbit className="h-5 w-5 text-primary" />
          <div className="flex flex-col leading-tight">
            <span className="text-[13px] font-semibold text-foreground/85">Orbit</span>
            <span className="text-[10px] text-foreground/40">
              VC Intelligence
            </span>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {visibleGroups.map((group) => (
          <div key={group.label} className="mb-3">
            <div className="mb-1 px-3 text-[11px] uppercase tracking-[0.04em] font-medium text-foreground/35">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={linkClasses(item)}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-foreground/[0.08] p-3 space-y-1">
        {isAdmin && (
          <>
            <button
              onClick={() => setDocsOpen(!docsOpen)}
              className="flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-[13px] font-medium text-foreground/55 transition-colors hover:bg-foreground/[0.06] hover:text-foreground/70"
            >
              <FileQuestion className="h-4 w-4" />
              Docs
              {docsOpen ? (
                <ChevronDown className="ml-auto h-3 w-3" />
              ) : (
                <ChevronRight className="ml-auto h-3 w-3" />
              )}
            </button>
            {docsOpen && (
              <div className="ml-2 space-y-0.5">
                {docsItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={linkClasses(item)}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
            <Link href="/settings" className={linkClasses({ href: "/settings", label: "Settings", icon: Settings })}>
              <Settings className="h-4 w-4" />
              Settings
            </Link>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 rounded-[8px] border-foreground/[0.08] text-[13px] text-foreground/55 hover:bg-foreground/[0.06]"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
              {syncing ? "Syncing..." : "Sync All Feeds"}
            </Button>
          </>
        )}

        {session?.user && (
          <div className="flex items-center gap-2 rounded-[8px] px-3 py-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {(session.user.name || session.user.email || "?")[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-[13px] font-medium text-foreground/85">
                {session.user.name || session.user.email}
              </p>
              <p className="text-[10px] uppercase tracking-[0.04em] text-foreground/40">
                {session.user.role}
              </p>
            </div>
          </div>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-[13px] font-medium text-foreground/55 transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Abmelden
        </button>
      </div>
    </aside>
  );
}
