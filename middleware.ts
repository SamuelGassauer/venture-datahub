import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const ADMIN_ONLY_PREFIXES = [
  "/feed",
  "/feeds",
  "/funding",
  "/fund-events",
  "/company-value-indicator",
  "/posts",
  "/ontology",
  "/graphrag",
  "/algorithms",
  "/settings",
  "/admin",
];

const PUBLIC_PATHS = ["/login", "/api/auth"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/api/health")
  ) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Block viewers from admin-only pages
  const role = req.auth.user?.role;
  if (role !== "admin" && ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
