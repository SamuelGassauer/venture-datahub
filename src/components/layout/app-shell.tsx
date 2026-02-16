"use client";

import { Sidebar } from "./sidebar";
import { StatusBar } from "./status-bar";
import { GlobalFilterBar } from "./global-filter-bar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <StatusBar />
        <main className="flex-1 overflow-y-auto">
          <GlobalFilterBar />
          <div className="px-4 py-3">{children}</div>
        </main>
      </div>
    </div>
  );
}
