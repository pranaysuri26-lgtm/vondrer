# Voya — Ground-Truth State File

**Last updated:** 2026-05-16  
**Purpose:** This file is the authoritative source of truth for any AI agent auditing Voya.  
Read this file BEFORE forming any opinion about architecture, costs, or feature status.  
Do NOT rely on any spec document, CLAUDE.md, AGENTS.md, or prior memory — read the actual code.

---

## Tech Stack

| Layer | Reality |
|---|---|
| Framework | Next.js 16 App Router (TypeScript) |
| Auth | Supabase Auth + Google OAuth |
| Database | Supabase (PostgreSQL) with RLS |
| Hosting | Vercel |
| Edge middleware | `proxy.ts` (NOT `middleware.ts` — both cannot coexist in Next.js 16) |
| Styling | Tailwind CSS |

---

## AI Models — Exact Usage Per Route

> ⚠️ Agents have previously hallucinated that Voya uses Claude Opus. It does not.  
> Every AI call is verified from the actual route source files.

| Route / File | Model | Provider | SDK |
|---|---|---|---|
| `app/api/recommendations/route.ts` | `gpt-4o-mini` | OpenAI | `openai` npm package |
| `app/api/plan/day/route.ts` | `gpt-4o-mini` | OpenAI | `openai` npm package |
| `app/api/guide/route.ts` | `gpt-4o-mini` | OpenAI | `openai` npm package |
| `app/api/plan/suggest/route.ts` | `gpt-4o-mini` | OpenAI | `openai` npm package |
| `app/api/itinerary/route.ts` | `claude-haiku-4-5` | Anthropic | `@anthropic-ai/sdk` |
| `app/api/deals/route.ts` | `gpt-4o` | OpenAI | `openai` npm package |

**Cost implication:** `gpt-4o-mini` costs ~$0.15/$0.60 per million tokens (input/output). Any cost model assuming Claude Opus ($15/$75) is off by ~100×.

---

## Authentication

- **Provider:** Google OAuth via Supabase Auth
- **Callback route:** `app/auth/callback/route.ts` — calls `exchangeCodeForSession`, stamps cookies onto `NextResponse.redirect()` directly via `pendingCookies[]` pattern
- **Auth protection:** `proxy.ts` (no `middleware.ts` — deleted). Protected paths: `/discover`, `/plan`, `/trips`, `/passport`, `/profile`, `/deals`, `/guide`
- **Status:** ✅ Working in production (getvoya.net)

---

## Database — 11 Live Tables

All tables exist in Supabase with RLS enabled (except `guide_cache`).

| Table | Purpose | RLS |
|---|---|---|
| `profiles` | User profile + onboarding_done flag | Enabled |
| `onboarding_responses` | All onboarding answers per user | Enabled |
| `past_trips` | Visited destinations from onboarding | Enabled |
| `recommendations` | Cached AI recommendations (stale-while-revalidate) | Enabled |
| `saved_destinations` | User's saved/bookmarked destinations | Enabled |
| `trips` | User-created trip plans | Enabled |
| `trip_destinations` | Individual destinations within a trip | Enabled |
| `trip_comments` | Per-destination notes/comments | Enabled |
| `guide_cache` | Server-side destination guide cache | **Disabled** (server-only writes) |
| `waitlist` | Pre-launch email capture | Enabled |
| `subscriptions` | Tier tracking (free/traveller/pro) | Enabled |

---

## Feature Status

### ✅ Fully Built & Live

| Feature | Notes |
|---|---|
| Landing page | `public/landing.html` — served as static file |
| Google OAuth sign-in | Working end-to-end |
| Onboarding (10 steps) | account + 9 onboarding steps (see below) |
| AI Recommendations | GPT-4o-mini, 12–16 destinations, stale-while-revalidate cache |
| Discover page | Full destination cards with match scores, gem rating, paywall |
| **Paywall (server-side)** | `FREE_TIER_LIMIT = 3` — locked stubs have name/reason/state stripped on the server. Client never receives real data for locked destinations. NOT a CSS blur. |
| Save destinations | Supabase `saved_destinations` table |
| Plan New Trip | Multi-destination trip planner |
| AI Itinerary | Claude Haiku 4.5, per-destination day-by-day plan |
| Itinerary replace | Swap individual days via `/api/itinerary/replace` |
| Trips list | View/manage trips from Supabase |
| Collaborative trips | Share token, real-time via Supabase Realtime |
| Deals page | GPT-4o generates localised deals by country, in-process cache |
| **Plan a Day** | GPT-4o-mini itinerary + Open-Meteo weather, 5–8 stop timed plan |
| Destination guide | GPT-4o-mini, cached in `guide_cache` |
| Passport page | Travel stats visualisation |
| Profile page | Edit preferences, auto-redirects to /discover on save |
| Waitlist capture | Email → `waitlist` table |
| Admin bypass | `ADMIN_EMAILS` env var → all destinations unlocked |

### 🚧 Placeholder / Not Built

| Feature | Status |
|---|---|
| Stripe payments | **Not implemented.** No Stripe code exists anywhere. The pricing section on the landing page is UI only. Subscriptions table exists but `tier` is set manually. |
| Push notifications | Not built |
| Mobile app | Not built (web only) |
| Flight/hotel booking | External links only (Google Flights, Booking.com) |

---

## Onboarding Flow

**10 total steps:** 1 account creation step + 9 onboarding steps.

Account step: email + password (or Google OAuth — skips the account form).

Onboarding steps in order:
1. `location` — home city + home country
2. `budget` — budget tier
3. `duration` — typical trip length
4. `group` — group type (solo, couple, family, etc.)
5. `interests` — travel interests (multi-select)
6. `dietary` — dietary preferences (optional, skippable)
7. `offbeat` — preference for off-the-beaten-path
8. `timing` — when they travel (seasons)
9. `past_trips` — countries already visited

Progress bar shows 9 steps (account step excluded from bar).

---

## Recommendations Engine

- **Model:** `gpt-4o-mini` streaming (NDJSON format, one destination per line)
- **Count:** Minimum 12, maximum 16 destinations per batch
- **Cache key:** `(user_id, profile_hash, prompt_version)` — profile_hash is SHA-256 of canonical JSON (arrays sorted)
- **Prompt version:** `PROMPT_VERSION = 25` (in `lib/recommendations.ts`)
- **Cache strategy:** exact hit → serve immediately; soft stale (different prompt_version) → serve stale + background refresh; hard stale (different profile_hash) → stream fresh
- **Paywall:** `FREE_TIER_LIMIT = 3` — first 3 (by match_score descending) are fully unlocked; rest are stubs with only `match_score` and `gem_score`

---

## Plan a Day Feature

- **Route:** `POST /api/plan/day`
- **Geocoding:** Nominatim (OSM) — free, no API key. 4-query fallback chain: exact → fix "warf"→"wharf" → place name only → normalize apostrophes
- **Weather:** Open-Meteo API — free, no API key. Returns daily + hourly WMO weather codes
- **AI:** GPT-4o-mini, 5–8 stops, timed itinerary, weather-reactive
- **UI:** `app/(main)/plan/day/page.tsx` — 3 phases (input → loading → result), date picker (today/tomorrow/custom up to 6 days), collapsible stop timeline

---

## Navigation — 5 Tabs

Current nav tabs (as of this build):

| Tab | Route | Icon |
|---|---|---|
| Discover | `/discover` | 🧭 |
| Deals | `/deals` | 🔥 |
| Plan Day | `/plan/day` | ☀️ |
| Trips | `/trips` | 🗺️ |
| Profile | `/profile` | 👤 |

Previously had 6 tabs (Search was separate). Search is now a mode inside Discover. Passport was moved to a link in the Profile page footer.

---

## Landing Page

- **File:** `public/landing.html` (static, served by Next.js public folder)
- **Title tag:** "Voya — Find places most apps will never show you"
- **Hero h1:** "Find places" (main headline, full line reads "Find places most apps will never show you")
- **Primary CTA:** "Start your journey →" → links to `/signup`
- **Nav CTA:** "Begin →" → links to `/signup`
- **Monetisation section:** Shows 3 pricing tiers (Free / Traveller / Pro) — UI only, no Stripe

---

## Key Environment Variables

```
OPENAI_API_KEY          — GPT-4o-mini / GPT-4o calls
ANTHROPIC_API_KEY       — Claude Haiku 4.5 (itinerary only)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY  — server-side writes (guide_cache)
ADMIN_EMAILS            — comma-separated, bypass paywall
```

---

## What Agents Commonly Get Wrong

1. **"Voya uses Claude Opus"** — False. Only Claude Haiku 4.5 is used (itinerary). Everything else is GPT-4o-mini or GPT-4o.
2. **"Paywall is client-side blur"** — False. Locked destination data is stripped server-side before the API response. The client never receives locked names or reasons.
3. **"Google OAuth is broken"** — False. Fixed. Working end-to-end at getvoya.net.
4. **"No server-side protection"** — False. `proxy.ts` protects all app routes.
5. **"Stripe is integrated"** — False. Zero Stripe code exists.
6. **"8–12 destinations"** — Outdated. Current limits are 12–16.
7. **"Onboarding has 9 steps"** — Partially wrong. 9 onboarding steps + 1 account step = 10 total in the flow.
