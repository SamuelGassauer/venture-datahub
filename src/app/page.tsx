"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Shield,
  Zap,
  RefreshCw,
  Building2,
  Landmark,
  Handshake,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Animated network graph (hero background)
// ---------------------------------------------------------------------------

const NODES = [
  { x: 15, y: 25, r: 3, type: "fund" },
  { x: 35, y: 15, r: 4, type: "fund" },
  { x: 55, y: 30, r: 3.5, type: "startup" },
  { x: 75, y: 20, r: 3, type: "startup" },
  { x: 25, y: 55, r: 3.5, type: "fund" },
  { x: 45, y: 50, r: 5, type: "startup" },
  { x: 65, y: 55, r: 3, type: "fund" },
  { x: 85, y: 45, r: 4, type: "startup" },
  { x: 20, y: 80, r: 3, type: "startup" },
  { x: 40, y: 75, r: 3.5, type: "fund" },
  { x: 60, y: 80, r: 3, type: "startup" },
  { x: 80, y: 70, r: 4.5, type: "fund" },
  { x: 50, y: 65, r: 3, type: "startup" },
  { x: 10, y: 50, r: 2.5, type: "startup" },
  { x: 90, y: 30, r: 2.5, type: "fund" },
  { x: 30, y: 40, r: 2.5, type: "fund" },
];

const EDGES = [
  [0, 2], [0, 5], [1, 2], [1, 3], [1, 5], [2, 5], [3, 7],
  [4, 5], [4, 8], [4, 9], [5, 6], [5, 12], [6, 7], [6, 11],
  [7, 11], [8, 9], [9, 10], [9, 12], [10, 11], [11, 12],
  [13, 0], [13, 4], [14, 3], [14, 7], [15, 5], [15, 2],
];

function NetworkGraph() {
  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id="glow-fund" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="glow-startup" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#10B981" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Edges */}
      {EDGES.map(([a, b], i) => (
        <line
          key={`e-${i}`}
          x1={NODES[a].x}
          y1={NODES[a].y}
          x2={NODES[b].x}
          y2={NODES[b].y}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="0.15"
          className="animate-edge-draw"
          style={{ animationDelay: `${i * 0.08}s` }}
        />
      ))}

      {/* Glow halos */}
      {NODES.map((n, i) => (
        <circle
          key={`glow-${i}`}
          cx={n.x}
          cy={n.y}
          r={n.r * 3}
          fill={`url(#glow-${n.type})`}
          opacity={0.15}
          className="animate-pulse-slow"
          style={{ animationDelay: `${i * 0.3}s` }}
        />
      ))}

      {/* Nodes */}
      {NODES.map((n, i) => (
        <circle
          key={`n-${i}`}
          cx={n.x}
          cy={n.y}
          r={n.r * 0.4}
          fill={n.type === "fund" ? "#3B82F6" : "#10B981"}
          opacity={0.7}
          className="animate-node-appear"
          style={{ animationDelay: `${0.3 + i * 0.06}s` }}
        />
      ))}

      {/* Animated data pulses along edges */}
      {[0, 3, 6, 10, 14, 18].map((edgeIdx) => {
        const [a, b] = EDGES[edgeIdx];
        return (
          <circle
            key={`pulse-${edgeIdx}`}
            r="0.5"
            fill="#fff"
            opacity="0.6"
          >
            <animateMotion
              dur={`${3 + edgeIdx * 0.4}s`}
              repeatCount="indefinite"
              path={`M${NODES[a].x},${NODES[a].y} L${NODES[b].x},${NODES[b].y}`}
            />
            <animate
              attributeName="opacity"
              values="0;0.7;0.7;0"
              dur={`${3 + edgeIdx * 0.4}s`}
              repeatCount="indefinite"
            />
          </circle>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Animated counter
// ---------------------------------------------------------------------------

function AnimatedNumber({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const start = performance.now();
          const duration = 1800;
          const animate = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(Math.round(eased * target));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);

  return (
    <span ref={ref} className="tabular-nums">
      {value.toLocaleString("en-US")}{suffix}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Copy button for code
// ---------------------------------------------------------------------------

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="absolute top-3 right-3 rounded-[8px] bg-white/[0.06] border border-white/[0.08] p-1.5 text-white/40 hover:text-white/70 hover:bg-white/[0.1] transition-all"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const curlCode = `curl "https://orbit.inventure.capital/api/v1/investors?limit=3" \\
  -H "Authorization: Bearer orb_sk_live_..."`;

const responseCode = `{
  "data": [
    {
      "externalId": "fund_earlybird",
      "name": "Earlybird Venture Capital",
      "website": "https://earlybird.com",
      "hq": "Berlin, Germany",
      "aumUsdMillions": 800,
      "sectorFocus": ["FINTECH", "DEEP TECH"],
      "geoFocus": ["DACH", "CEE", "NORDICS"],
      "roundRole": "LEAD",
      "updatedAt": "2026-03-05T14:22:00Z"
    }
  ],
  "pagination": {
    "cursor": "eyJpZCI6MjN9",
    "hasMore": true
  }
}`;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white selection:bg-blue-500/30">
      {/* ── Nav ── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-[6px] bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <span className="text-[11px] font-bold text-white">O</span>
            </div>
            <span className="text-[15px] font-semibold tracking-[-0.02em]">Orbit</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#api" className="text-[13px] text-white/40 hover:text-white/70 transition-colors">API</a>
            <a href="#features" className="text-[13px] text-white/40 hover:text-white/70 transition-colors">Features</a>
            <a href="#data" className="text-[13px] text-white/40 hover:text-white/70 transition-colors">Data</a>
            <Link href="/playground" className="text-[13px] text-white/40 hover:text-white/70 transition-colors">Playground</Link>
            <Link href="/login" className="text-[13px] text-white/50 hover:text-white/80 transition-colors">
              Sign in
            </Link>
            <Link
              href="mailto:samuel.gassauer@inventure.de?subject=Orbit%20API%20Access"
              className="apple-btn-blue px-3.5 py-1.5 text-[13px] font-medium"
            >
              Get Access
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden pt-14">
        {/* Background network */}
        <div className="absolute inset-0 opacity-60">
          <NetworkGraph />
        </div>

        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#09090b] via-transparent to-[#09090b]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#09090b]/80 via-transparent to-[#09090b]/80" />

        {/* Radial glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-blue-500/[0.07] blur-[120px]" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 mb-8 animate-fade-in">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[12px] font-medium text-white/50">API v1 — Live in Production</span>
          </div>

          {/* Headline */}
          <h1 className="text-[clamp(2.5rem,6vw,4.5rem)] font-black tracking-tight leading-[1.05] mb-6 animate-fade-in-up">
            The intelligence layer
            <br />
            for{" "}
            <span className="bg-gradient-to-r from-blue-400 via-blue-300 to-emerald-400 bg-clip-text text-transparent">
              European venture
            </span>
          </h1>

          {/* Sub */}
          <p className="text-[17px] text-white/40 tracking-[-0.01em] max-w-xl mx-auto mb-10 leading-relaxed animate-fade-in-up animation-delay-100">
            Structured data on funds, startups, and investments.
            Cursor-paginated, incrementally synced, updated daily.
          </p>

          {/* CTAs */}
          <div className="flex items-center justify-center gap-4 animate-fade-in-up animation-delay-200">
            <Link
              href="mailto:samuel.gassauer@inventure.de?subject=Orbit%20API%20Access"
              className="apple-btn-blue flex items-center gap-2.5 px-6 py-3 text-[15px] font-semibold"
            >
              Request API Access
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#api"
              className="flex items-center gap-2 rounded-[14px] border border-white/[0.1] bg-white/[0.03] px-6 py-3 text-[15px] font-medium text-white/60 hover:text-white/80 hover:bg-white/[0.06] transition-all"
            >
              Read Docs
              <ChevronRight className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-[#09090b] to-transparent" />
      </section>

      {/* ── Three entities ── */}
      <section className="relative py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-blue-400/70 mb-3">
              Three Endpoints. One API.
            </p>
            <h2 className="text-[clamp(1.8rem,3.5vw,2.8rem)] font-bold tracking-tight">
              Everything you need
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: Landmark,
                name: "Investors",
                endpoint: "/api/v1/investors",
                color: "blue",
                fields: "16 fields",
                desc: "Investment profiles, ticket sizes, AUM, sector & geo focus. Website as primary dedup key.",
              },
              {
                icon: Building2,
                name: "Startups",
                endpoint: "/api/v1/startups",
                color: "emerald",
                fields: "10 fields",
                desc: "Company data, founders, funding stage, and sector classification. Incl. optional founder objects.",
              },
              {
                icon: Handshake,
                name: "Investments",
                endpoint: "/api/v1/investments",
                color: "violet",
                fields: "11 fields",
                desc: "Individual participations: cheque size vs. round size, co-investors, and round type.",
              },
            ].map((entity) => (
              <div
                key={entity.name}
                className="group relative rounded-[16px] border border-white/[0.06] bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300"
              >
                {/* Glow on hover */}
                <div className={`absolute -inset-px rounded-[16px] bg-gradient-to-b ${
                  entity.color === "blue" ? "from-blue-500/10" :
                  entity.color === "emerald" ? "from-emerald-500/10" :
                  "from-violet-500/10"
                } to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10`} />

                <div className="flex items-center gap-3 mb-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-[10px] ${
                    entity.color === "blue" ? "bg-blue-500/10 text-blue-400" :
                    entity.color === "emerald" ? "bg-emerald-500/10 text-emerald-400" :
                    "bg-violet-500/10 text-violet-400"
                  }`}>
                    <entity.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold tracking-[-0.02em]">
                      {entity.name}
                    </h3>
                    <code className={`text-[11px] font-mono ${
                      entity.color === "blue" ? "text-blue-400/70" :
                      entity.color === "emerald" ? "text-emerald-400/70" :
                      "text-violet-400/70"
                    }`}>
                      GET {entity.endpoint}
                    </code>
                  </div>
                </div>
                <p className="text-[13px] text-white/35 leading-relaxed mb-4">
                  {entity.desc}
                </p>
                <div className="flex gap-2">
                  <span className="rounded-full bg-white/[0.04] border border-white/[0.06] px-2.5 py-0.5 text-[10px] font-medium text-white/40">
                    {entity.fields}
                  </span>
                  <span className="rounded-full bg-white/[0.04] border border-white/[0.06] px-2.5 py-0.5 text-[10px] font-medium text-white/40">
                    Cursor Pagination
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── API example ── */}
      <section id="api" className="relative py-24 px-6 scroll-mt-16">
        {/* Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-blue-500/[0.04] blur-[100px]" />

        <div className="max-w-6xl mx-auto relative">
          <div className="text-center mb-16">
            <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-emerald-400/70 mb-3">
              Developer Experience
            </p>
            <h2 className="text-[clamp(1.8rem,3.5vw,2.8rem)] font-bold tracking-tight">
              One request. All data.
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Request */}
            <div className="rounded-[14px] border border-white/[0.06] bg-[#0f0f11] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06]">
                <span className="rounded-[4px] bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-mono font-bold text-emerald-400">
                  GET
                </span>
                <span className="text-[12px] font-mono text-white/40">Request</span>
              </div>
              <div className="relative p-4">
                <CopyBtn text={curlCode} />
                <pre className="text-[12.5px] font-mono leading-relaxed">
                  <code>
                    <span className="text-violet-400">curl</span>{" "}
                    <span className="text-amber-300">&quot;https://orbit.inventure.capital/api/v1/investors?limit=3&quot;</span>{" "}
                    <span className="text-white/30">\</span>
                    {"\n  "}
                    <span className="text-blue-400">-H</span>{" "}
                    <span className="text-amber-300">&quot;Authorization: Bearer orb_sk_live_...&quot;</span>
                  </code>
                </pre>
              </div>
            </div>

            {/* Response */}
            <div className="rounded-[14px] border border-white/[0.06] bg-[#0f0f11] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06]">
                <span className="rounded-[4px] bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-mono font-bold text-emerald-400">
                  200
                </span>
                <span className="text-[12px] font-mono text-white/40">Response</span>
              </div>
              <div className="relative p-4">
                <CopyBtn text={responseCode} />
                <pre className="text-[12px] font-mono leading-relaxed max-h-[320px] overflow-auto text-white/60 pr-8">
                  <code>{responseCode}</code>
                </pre>
              </div>
            </div>
          </div>

          {/* Try it CTA */}
          <div className="text-center mt-10">
            <Link
              href="/playground"
              className="inline-flex items-center gap-2 rounded-[14px] border border-white/[0.1] bg-white/[0.03] px-5 py-2.5 text-[13px] font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-all"
            >
              Try in Playground
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Features bento ── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-violet-400/70 mb-3">
              Built for Integration
            </p>
            <h2 className="text-[clamp(1.8rem,3.5vw,2.8rem)] font-bold tracking-tight">
              Enterprise-ready by default
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Large card */}
            <div className="md:col-span-2 rounded-[16px] border border-white/[0.06] bg-white/[0.02] p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-blue-500/10">
                  <RefreshCw className="h-5 w-5 text-blue-400" />
                </div>
                <h3 className="text-[17px] font-semibold tracking-[-0.02em]">Incremental Sync</h3>
              </div>
              <p className="text-[14px] text-white/35 leading-relaxed mb-6 max-w-lg">
                Store the timestamp of your last sync and request only changed records.
                No full dump needed — we deliver only the delta.
              </p>
              <div className="rounded-[10px] border border-white/[0.06] bg-[#0f0f11] p-4">
                <pre className="text-[12px] font-mono leading-relaxed">
                  <code>
                    <span className="text-white/30">{"// First sync"}</span>
                    {"\n"}
                    <span className="text-violet-400">GET</span>{" "}
                    <span className="text-white/60">/api/v1/investors</span>
                    {"\n\n"}
                    <span className="text-white/30">{"// From now on, deltas only"}</span>
                    {"\n"}
                    <span className="text-violet-400">GET</span>{" "}
                    <span className="text-white/60">/api/v1/investors</span>
                    <span className="text-amber-300">?updated_since=2026-03-05T14:00:00Z</span>
                  </code>
                </pre>
              </div>
            </div>

            {/* Small cards */}
            <div className="space-y-4">
              <div className="rounded-[16px] border border-white/[0.06] bg-white/[0.02] p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-emerald-500/10 mb-3">
                  <Shield className="h-5 w-5 text-emerald-400" />
                </div>
                <h3 className="text-[15px] font-semibold tracking-[-0.02em] mb-2">Scoped API Keys</h3>
                <p className="text-[13px] text-white/35 leading-relaxed">
                  Bearer token auth with granular scopes, rate limiting, and real-time usage tracking.
                </p>
              </div>
              <div className="rounded-[16px] border border-white/[0.06] bg-white/[0.02] p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-violet-500/10 mb-3">
                  <Zap className="h-5 w-5 text-violet-400" />
                </div>
                <h3 className="text-[15px] font-semibold tracking-[-0.02em] mb-2">Cursor Pagination</h3>
                <p className="text-[13px] text-white/35 leading-relaxed">
                  Stable cursors instead of fragile offsets. Consistent even with millions of records.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section id="data" className="py-24 px-6 scroll-mt-16">
        <div className="max-w-6xl mx-auto">
          <div className="rounded-[20px] border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-12">
            <div className="text-center mb-12">
              <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-blue-400/70 mb-3">
                Live Data
              </p>
              <h2 className="text-[clamp(1.8rem,3.5vw,2.8rem)] font-bold tracking-tight">
                The European ecosystem — quantified
              </h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
              {[
                { value: 2800, suffix: "+", label: "Investors" },
                { value: 12500, suffix: "+", label: "Startups" },
                { value: 8400, suffix: "+", label: "Investments" },
                { value: 15, label: "Regions" },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className="text-[clamp(2rem,4vw,3rem)] font-black tracking-tight bg-gradient-to-b from-white to-white/50 bg-clip-text text-transparent">
                    <AnimatedNumber target={stat.value} suffix={stat.suffix || ""} />
                  </p>
                  <p className="text-[13px] text-white/30 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Sector pills */}
            <div className="flex flex-wrap justify-center gap-2">
              {[
                "FINTECH", "CLIMATE", "DEEP TECH", "BIOTECH", "CYBERSECURITY",
                "MACHINE LEARNING", "PROPTECH", "HEALTHCARE", "WEB3", "LOGISTICS",
                "EDUCATION", "ENERGY", "ROBOTICS",
              ].map((sector) => (
                <span
                  key={sector}
                  className="rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-[11px] font-mono font-medium text-white/25"
                >
                  {sector}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-32 px-6 relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-blue-500/[0.06] blur-[120px]" />
        <div className="max-w-2xl mx-auto text-center relative">
          <h2 className="text-[clamp(1.8rem,4vw,3rem)] font-black tracking-tight mb-4">
            Ready for
            <br />
            <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
              API access?
            </span>
          </h2>
          <p className="text-[15px] text-white/35 mb-8 leading-relaxed">
            We'll set up your scoped API key and support you with
            the integration. Write us — response within 24h.
          </p>
          <Link
            href="mailto:samuel.gassauer@inventure.de?subject=Orbit%20API%20Access"
            className="apple-btn-blue inline-flex items-center gap-2.5 px-7 py-3.5 text-[15px] font-semibold"
          >
            samuel.gassauer@inventure.de
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.06] py-8 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-[4px] bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <span className="text-[8px] font-bold text-white">O</span>
            </div>
            <span className="text-[12px] text-white/25">
              Orbit — Inventure Capital GmbH
            </span>
          </div>
          <Link
            href="/login"
            className="text-[12px] text-white/20 hover:text-white/40 transition-colors"
          >
            Dashboard
          </Link>
        </div>
      </footer>
    </div>
  );
}
