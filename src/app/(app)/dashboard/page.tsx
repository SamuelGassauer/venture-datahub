"use client";

import { useSession } from "next-auth/react";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { ViewerDashboard } from "@/components/dashboard/viewer-dashboard";

export default function DashboardPage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-10 rounded-[10px]" />
        <Skeleton className="h-24 rounded-[14px]" />
        <Skeleton className="h-64 rounded-[16px]" />
      </div>
    );
  }

  if (session?.user?.role === "admin") {
    return <AdminDashboard />;
  }

  return <ViewerDashboard />;
}
