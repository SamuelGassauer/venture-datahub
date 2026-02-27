"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get("callbackUrl") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        callbackUrl,
        redirect: false,
      });
      if (result?.error) {
        setError("Invalid email or password");
      } else if (result?.url) {
        window.location.href = result.url;
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Email</label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="glass-search-input w-full px-3 py-2 text-[13px] tracking-[-0.01em]"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="glass-search-input w-full px-3 py-2 text-[13px] tracking-[-0.01em]"
          />
        </div>
        {error && <p className="text-[13px] text-red-500">{error}</p>}
        <button type="submit" className="apple-btn-blue w-full py-2.5 text-[13px] font-semibold" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full" style={{ borderTop: "0.5px solid rgba(var(--foreground-rgb, 0 0 0) / 0.1)" }} />
        </div>
        <div className="relative flex justify-center text-[11px] tracking-[0.04em] uppercase">
          <span className="bg-transparent px-2 text-foreground/30">or</span>
        </div>
      </div>

      <button
        className="glass-capsule-btn w-full py-2.5 text-[13px] font-medium"
        onClick={() => signIn("google", { callbackUrl })}
      >
        Sign in with Google
      </button>

      {process.env.NODE_ENV === "development" && (
        <>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full" style={{ borderTop: "0.5px solid rgba(var(--foreground-rgb, 0 0 0) / 0.1)" }} />
            </div>
            <div className="relative flex justify-center text-[11px] tracking-[0.04em] uppercase">
              <span className="bg-transparent px-2 text-foreground/30">quick login</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="glass-capsule-btn py-1.5 text-[13px]"
              disabled={loading}
              onClick={() => {
                setEmail("admin@inventure.com");
                setPassword("admin123");
              }}
            >
              Admin
            </button>
            <button
              className="glass-capsule-btn py-1.5 text-[13px]"
              disabled={loading}
              onClick={() => {
                setEmail("viewer@inventure.de");
                setPassword("admin123");
              }}
            >
              Viewer
            </button>
          </div>
        </>
      )}
    </div>
  );
}
