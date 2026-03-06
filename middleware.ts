import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth", "/playground"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets, public API endpoints, and landing page
  if (
    pathname === "/" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/funding-rounds") ||
    pathname.startsWith("/api/v1/")
  ) {
    return NextResponse.next();
  }

  // Everything under /app requires authentication
  if (pathname.startsWith("/app")) {
    if (!req.auth) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Admin-only paths
    const ADMIN_ONLY_PREFIXES = [
      "/app/feed",
      "/app/feeds",
      "/app/funding",
      "/app/fund-events",
      "/app/company-value-indicator",
      "/app/posts",
      "/app/ontology",
      "/app/graphrag",
      "/app/algorithms",
      "/app/settings",
      "/app/admin",
      "/app/historical-import",
    ];

    const role = req.auth.user?.role;
    if (role !== "admin" && ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL("/app/dashboard", req.url));
    }

    return NextResponse.next();
  }

  // Redirect unauthenticated users trying to access unknown paths
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
