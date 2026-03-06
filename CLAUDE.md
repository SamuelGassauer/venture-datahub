# RSS Scraper - EU Startup Funding Tracker

## Tech Stack
- Next.js 14+ (App Router), React, TypeScript, Tailwind CSS
- Neo4j (graph database), Prisma (PostgreSQL), Vercel Blob Storage
- shadcn/ui components, Lucide icons, Geist Sans font

## Design System: Apple Liquid Glass

This project uses an Apple-inspired "Liquid Glass" design system (macOS Tahoe / iPadOS 26). The core principle is **"light is the material"** — every surface uses translucency, layered depth, and hairline borders instead of opaque fills.

### Five Governing Principles

| Principle | Implementation |
|-----------|---------------|
| **Translucency** | No `bg-white`/`bg-gray-*`. Use `rgba()` or glass classes |
| **Layered Depth** | Multi-stop shadows (contact → near → mid → far) |
| **Hairline Borders** | All borders `0.5px` with semi-transparent colors |
| **Top-left Lighting** | Gradients/highlights at ~170° angle |
| **Minimal Chrome** | Text hierarchy via opacity, not color changes |

### Glass Surface Classes (defined in globals.css)

| Class | Tier | Use |
|-------|------|-----|
| `.liquid-glass` | 5 | Dialogs, modals (use `<LiquidGlass>` component) |
| `.glass-popover` | 4 | Popovers, dropdowns, context menus |
| `.lg-inset` | 3 | Table wrappers, grouped lists, recessed containers |
| `.glass-status-bar` | 2 | Page headers, filter toolbars, pagination footers |
| `.glass-table-header` | 2 | Sticky table column headers |
| `.glass-search-input` | — | Text inputs, search boxes |
| `.glass-capsule-btn` | — | Secondary/icon buttons (pill-shaped) |
| `.apple-btn-blue` | — | Primary CTA button (one per view). **Always white text** (`color: #fff` via CSS — no extra Tailwind class needed) |

### Row Separators
- `.lg-inset-row` — Settings/detail list rows
- `.lg-inset-table-row` — Data table rows (supports `[data-state="selected"]`)

### Typography

| Token | Size | Tracking | Weight | Use |
|-------|------|----------|--------|-----|
| Display | `text-4xl` | `tracking-tight` | `font-black` | Hero metrics |
| Title L | `text-2xl` | `tracking-tight` | `font-bold` | Stat card values |
| Title M | `text-[17px]` | `tracking-[-0.02em]` | `font-semibold` | Dialog titles, section heads |
| Title S | `text-[15px]` | `tracking-[-0.02em]` | `font-semibold` | Card names |
| Body | `text-[13px]` | `tracking-[-0.01em]` | `font-normal` | Default text, table cells |
| Body Emphasis | `text-[13px]` | `tracking-[-0.01em]` | `font-semibold` | Names, links |
| Caption | `text-[12px]` | `tracking-[-0.01em]` | `font-normal` | Secondary info |
| Micro | `text-[11px]` | `tracking-[-0.01em]` | `font-medium` | Tertiary info |
| Label | `text-[11px]` | `tracking-[0.04em]` | `font-medium uppercase` | Column headers, group labels |
| Badge | `text-[10px]` | — | `font-medium` | Pill badges |

### Text Color via Opacity (NEVER use `text-muted-foreground`)

| Opacity | Tailwind | Role |
|---------|----------|------|
| 85% | `text-foreground/85` | Primary text |
| 70% | `text-foreground/70` | Strong secondary |
| 55% | `text-foreground/55` | Secondary text |
| 45% | `text-foreground/45` | Body text |
| 40% | `text-foreground/40` | Tertiary, icons |
| 35% | `text-foreground/35` | Pagination, column headers |
| 30% | `text-foreground/30` | Search icons, timestamps |
| 15% | `text-foreground/15` | Empty state icons |

### Border Radius Scale

| Radius | Use |
|--------|-----|
| `rounded-[24px]` | LiquidGlass panels |
| `rounded-[16px]` | lg-inset table wrappers |
| `rounded-[14px]` | lg-inset default, apple-btn-blue |
| `rounded-[10px]` | glass-search-input, popover items |
| `rounded-[8px]` | Small interactive elements |
| `rounded-[6px]` | Select items, skeletons |
| `rounded-full` | glass-capsule-btn, pills, avatars |

### Status Colors (always translucent)

| Status | Background | Text |
|--------|-----------|------|
| Success | `bg-emerald-500/8` | `text-emerald-600 dark:text-emerald-400` |
| Error | `bg-red-500/8` | `text-red-500` |
| Warning | `bg-amber-500/8` | `text-amber-600` |
| Info | `bg-blue-500/8` | `text-blue-600` |
| Neutral | `bg-foreground/[0.04]` | `text-foreground/45` |

### Layout Pattern (every page)

```tsx
<>
  {/* Tier 2: Filter toolbar */}
  <div className="glass-status-bar px-4 py-2.5">...</div>

  {/* Tier 3: Scrollable content */}
  <div className="flex-1 overflow-auto p-4">
    <div className="lg-inset rounded-[16px]">
      {/* Table or list */}
    </div>
  </div>

  {/* Tier 2: Pagination footer */}
  <div className="glass-status-bar px-4 py-2">...</div>
</>
```

### Anti-Patterns (NEVER do this)

- `bg-white`, `bg-gray-50`, `bg-slate-100` → use glass classes or `bg-foreground/[0.04]`
- `shadow-lg`, `shadow-xl` → use multi-layer box-shadow via glass classes
- `text-gray-500`, `text-muted-foreground` → use `text-foreground/{opacity}`
- `rounded-lg`, `rounded-xl` → use specific `rounded-[Npx]` from scale
- `border` (default 1px) on containers → use glass class borders (0.5px)
- Single-layer shadows → always multi-stop
