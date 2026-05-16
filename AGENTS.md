# Voya — Agent Knowledge Base

> Read this before touching anything. It covers what Voya is, how it's built,
> every key file, recent changes, and the rules that keep things consistent.

---

## 1. What Voya Is

Voya is an AI-powered travel intelligence web app. It matches travellers to
destinations based on their preferences, generates day-by-day itineraries, and
provides real-time on-the-ground support via **Trip Ask**.

**Core promise:** 7 questions → 15–20 personalised destination matches.
No algorithms. No paid placements. Just the traveller.

**Live URL:** getvoya.net  
**Repo branch:** `main` → auto-deploys to Vercel

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Auth + DB | Supabase (SSR client via `@supabase/ssr`) |
| AI — itinerary | Anthropic Claude (`claude-haiku-4-5`) |
| AI — day planner | OpenAI `gpt-4o-mini` |
| Styling | Tailwind CSS v4 |
| Deployment | Vercel |

**Never use the Pages Router.** Everything is under `app/`.  
**Never import from `@supabase/auth-helpers-nextjs`** — use `@supabase/ssr`.

---

## 3. Brand & Design Tokens

### Colours
| Token | Hex | Usage |
|---|---|---|
| Terracotta | `#C97552` | Primary accent — CTAs, italic headlines, boarding pass stamp, gem dots |
| Parchment | `#FAF8F5` | Page background |
| Espresso | `#1A1410` | Primary text |
| Stone | `#6B5F54` | Secondary / muted text |
| Hairline | `#E8E0D6` | Borders and dividers |

**`#C15B3D` is wrong — always use `#C97552`.**

### Typography
| Role | Font |
|---|---|
| Headlines / display | Cormorant Garamond (live app) / Playfair Display (landing preview) |
| Body | Raleway (live app) / Outfit (landing preview) |
| Labels / eyebrows | Josefin Sans (live app) / Outfit tracking-widest (landing preview) |

---

## 4. Directory Map

```
voya-app/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx          — login page
│   │   └── signup/page.tsx         — 7-step onboarding (see §6)
│   ├── (main)/
│   │   ├── layout.tsx              — authenticated shell
│   │   ├── dashboard/page.tsx      — destination matches
│   │   ├── plan/
│   │   │   └── day/page.tsx        — Smart Day Planner UI (see §8)
│   │   └── trip/[id]/page.tsx      — saved trip detail
│   ├── api/
│   │   ├── itinerary/route.ts      — POST: generate full trip itinerary (Claude)
│   │   ├── plan/day/
│   │   │   ├── route.ts            — POST: simple day plan
│   │   │   └── smart/route.ts      — POST: smart day plan (see §9)
│   │   └── ...
│   ├── trip/[token]/page.tsx       — public share page (no auth required)
│   └── page.tsx                    — root: redirects unauthed → /landing.html
├── public/
│   └── landing.html                — THE live marketing landing page (see §10)
├── lib/
│   └── sun.ts                      — geocode + sunrise/golden-hour helpers
├── AGENTS.md                       — this file
└── CLAUDE.md                       — points to this file
```

---

## 5. Supabase Schema (key tables)

```sql
trips              (id, user_id, trip_name, total_days, start_date, end_date, share_token)
trip_destinations  (id, trip_id, destination_name, country, days, start_date, end_date,
                    position, itinerary_json jsonb, notes)
profiles           (id, email, onboarding_data jsonb, ...)
```

- `itinerary_json` is typed as `ItineraryDay[]` (see `app/api/itinerary/route.ts`)
- `share_token` is a UUID; the public share page reads it via service-role key to bypass RLS
- RLS is ON — always use the server client with the right key for the context

---

## 6. Onboarding — 7 Steps

```ts
// app/(auth)/signup/page.tsx
const ONBOARDING_STEPS = [
  'location',    // Where are you based?
  'budget',      // What's your travel budget?
  'duration',    // How long do you travel?
  'group',       // Who do you travel with?
  'interests',   // What interests you?
  'offbeat',     // How off-the-beaten-path?
  'past_trips',  // Where have you been?
]
```

**It is 7 questions, not 5.** Any copy that says "5 questions" is wrong — change it.

---

## 7. Pricing Tiers (current)

| Tier | Price | Key limits |
|---|---|---|
| **Explorer** | Free forever | 3 destination matches, gem score, transport options, deals board |
| **Traveller** | **$4.99 one-time** (NOT /month, NO trial) | All 15–20 matches, full filters, 30 days access, no subscription |
| **Pro** | $29/year | Full itinerary, hotel & flight recs, smart booking advice, Voya Passport stamps |

---

## 8. Smart Day Planner (`app/(main)/plan/day/page.tsx`)

The page has two modes toggled by a "Smart mode" switch:

**Simple mode** — calls `/api/plan/day` (existing basic endpoint).

**Smart mode** — calls `/api/plan/day/smart` and renders a live-edit timeline:
- `LiveStopCard` — each stop with Mark Done / Remove buttons
- `AddStopRow` — inline input to insert a stop between any two existing ones
- `CompletedRow` — greyed-out rows for done stops
- `handleReplan()` — rebuilds context from current state and re-calls the smart API
- Time-left chip — e.g. "4h 39min left · Boudin Bakery"
- Context textarea (collapsible) — natural language context fed to GPT for parsing

---

## 9. Smart Day API (`app/api/plan/day/smart/route.ts`)

**POST** — requires auth. Body: `{ place: string, date: string, context?: string }`

Three steps run in sequence (step 2 is parallel internally):

1. **Geocode** via Nominatim (OpenStreetMap, no key)
2. **Parallel:**
   - Weather from Open-Meteo (free, no key) — returns `SmartWeather`
   - GPT context parse (`gpt-4o-mini`, max 300 tokens) — extracts `SmartDayContext`
3. **Plan generation** (`gpt-4o-mini`, max 1100 tokens) — returns `SmartDayPlan`

**Key types** (exported from this file — import them if needed):
```ts
SmartStop        { id, time, duration, name, description, tip, type, done }
SmartDayContext  { current_time, end_time, end_place, completed[], must_dos[], group }
SmartDayPlan     { title, summary, stops[], time_budget }
SmartWeather     { label, emoji, temp_high, temp_low, rain_pct, unit }
SmartDayResponse { plan, weather, context, location }
```

`maxDuration = 30` is set on this route (Vercel Pro limit).

---

## 10. Itinerary API (`app/api/itinerary/route.ts`)

**POST** — requires auth.

- Model: `claude-haiku-4-5`, `max_tokens: 4000`
- Prompt caching enabled on the system prompt (`cache_control: { type: 'ephemeral' }`)
- System prompt built by `buildPrompt()` — varies 1,200–4,500 tokens depending on trip

**Approximate cost per generation:** $0.010–$0.020 (cached hits on system prompt reduce this).

---

## 11. Landing Page (`public/landing.html`)

This is the **live marketing page** served to unauthenticated visitors at getvoya.net.  
It is a **standalone HTML file** — no React, no JSX. Uses Tailwind CDN + Google Fonts.

**Last updated:** May 2026 — full redesign.

### What's in it
- **Navbar** — `How it works`, `Features`, `Pricing` links only. No "Destinations" or "Blog".
- **Hero** — two-column layout (copy left, boarding pass right at `xl:` breakpoint)
- **Floating boarding pass** — landscape 560px wide, vertical tear line + right stub
- **Marquee strip** — scrolling destinations/features text below hero
- **Features** — 3 cards: Find destination / Plan trip / Trip Ask
- **Gem Score section** — explains the hidden gem rating
- **Golden hour / photo spots** — dark background section
- **How it works** — 3 steps: Tell us who you are / We find what fits you / Plan it. Book it. Go.
- **Pricing** — Explorer / Traveller / Pro (correct prices, see §7)
- **CTA** — "Pack light. Wander far." / "Your first 3 matches are free forever."
- **Footer** — `© 2026 Voya` (no "Inc.")

### Boarding pass JS
- **120 destinations** across all continents, shuffled on page load
- Rotates every **3 seconds** — destination, budget, transport icon all update
- Passenger, class, seat, gate, departure, boarding time are randomly generated each flip
- Hidden Gem stamp (`#C97552` circle, −14° rotated) fades in/out per destination
- `gem: true` → "Hidden 💎" + stamp visible; `gem: false` → "Well-known 🌍"
- Pass number ticks up each rotation; barcode number reflects current pass

### Key element IDs (for JS targeting)
`origCode`, `origPlace`, `destCode`, `destSub`, `transportIcon`,
`passPassenger`, `passClass`, `passSeat`, `passGateVal`, `passDep`, `passBoarding`,
`stat1`, `stat3`, `passNum`, `passNum2`, `barcodeNum`, `passStamp`

---

## 12. Public Share Page (`app/trip/[token]/page.tsx`)

Server component — reads trip by `share_token` using **service-role key** (bypasses RLS).  
Falls back to anon key if service role key not set.

Features golden-hour strip (`GoldenHourStrip`) per destination using `lib/sun.ts`.  
Renders `DayCard` / `BlockCard` components from `itinerary_json`.

---

## 13. AI Model Rules

| Use case | Model | Why |
|---|---|---|
| Trip itinerary | `claude-haiku-4-5` | Handles long structured output, prompt caching |
| Day plan generation | `gpt-4o-mini` | Fast, cheap for structured JSON plans |
| Context parsing | `gpt-4o-mini` | 300 token extract — minimal cost |

- **Never swap models without checking `maxDuration`** on the route
- `claude-haiku-4-5` costs ~$0.80/M input, $4.00/M output
- `gpt-4o-mini` costs ~$0.15/M input, $0.60/M output
- Always use `response_format: { type: 'json_object' }` for structured outputs

---

## 14. Key Conventions

- **No `'use client'` on page files unless genuinely needed** — prefer server components
- **Supabase server client** always via `createServerClient` from `@supabase/ssr` + `cookies()`
- **Supabase browser client** via `createBrowserClient` — for client components only
- **All CTA buttons/links on the landing page** point to `/signup` or `/login`
- **Accent colour is always `#C97552`** — never `#C15B3D` or any other terracotta variant
- **7 questions** — never write "5 questions" anywhere in copy or comments
- **Traveller is $4.99 one-time** — never "$4.99/month" or add a free trial note
- **Explorer gets 3 free matches** — never "15 destination matches" for the free tier

---

## 15. Recent Changes (May 2026)

| What | File | Notes |
|---|---|---|
| Smart Day Planner | `app/(main)/plan/day/page.tsx` | Full rewrite — live-edit timeline, smart/simple toggle |
| Smart Day API | `app/api/plan/day/smart/route.ts` | New file — parallel weather + context parse + plan |
| Landing page redesign | `public/landing.html` | Full redesign replacing old Wadi Rum concept |
| Boarding pass | `public/landing.html` | Landscape layout, 120 destinations, gem stamp |
| Marquee strip | `public/landing.html` | Scrolling feature tags below hero |
| Gem Score section | `public/landing.html` | New section explaining gem rating system |
| Golden hour section | `public/landing.html` | Dark section — photo spots + Trip Ask |
| **AppNav dark theme** | `components/AppNav.tsx` | Nav changed from parchment (light) → dark glass `#0d1f35/95` to match all pages |
| **Trip Ask dark theme** | `app/(main)/plan/ask/page.tsx` | Full light→dark conversion — all components now use dark navy palette |
| **Trips page** | `app/(main)/trips/page.tsx` | Fixed bg `#111111` → `#0d1f35`, added atmospheric hero + imagery |
| **Atmospheric heroes** | All pages | Unsplash background images + gradient overlays on: discover, trips, profile, plan/day, plan/ask, deals, login, signup, passport |
| **Passport page** | `app/(main)/passport/page.tsx` | Visual redesign — passport book, stamp preview grid, CTA |

### UI Conventions (Dark Theme)
All authenticated pages use `bg-[#0d1f35]` (navy). Atmospheric hero sections use:
```html
<div class="relative overflow-hidden">
  <div class="absolute inset-0 bg-cover bg-center opacity-12" style="background-image: url('...unsplash...')" />
  <div class="absolute inset-0 bg-gradient-to-b from-[#0d1f35]/40 to-[#0d1f35]" />
  <div class="relative ..."><!-- content --></div>
</div>
```
Opacity range 8–15% keeps images subtle so white text remains readable.
