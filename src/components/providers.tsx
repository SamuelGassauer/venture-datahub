"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { GlobalFiltersProvider } from "@/lib/global-filters";

function FiltersWithRole({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  return (
    <GlobalFiltersProvider role={session?.user?.role}>
      {children}
    </GlobalFiltersProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <FiltersWithRole>
          {children}
        </FiltersWithRole>
        <Toaster richColors position="bottom-right" />
      </ThemeProvider>
    </SessionProvider>
  );
}
