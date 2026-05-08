# Phase 5 — Destination Guide

**Status:** Spec locked. Build after first paying user.
**Decided by:** CPO, 2026-05-08. All four decisions final.

---

## What it is

A second flow alongside discovery for users who already know where they're going.

Entry point on discover page:
> "Already know where you're going?"
> [Search a destination]

User types a city → Voya generates a personalised local guide.

---

## Decision 1 — Route

`/guide/[destination]` — separate route, shareable URL.
Entry point lives on the discover page.

---

## Decision 2 — Schema

```json
{
  "destination": "Atlanta",
  "tagline": "Atlanta like a local",
  "user_context": {
    "budget_tier": "50-150",
    "travel_style": "solo",
    "home_city": "Durham",
    "interests": ["local-food", "hidden-gems"]
  },
  "neighbourhoods": [
    { "name": "Old Fourth Ward", "why": "...", "not": "Buckhead" }
  ],
  "hidden_spots": [
    { "name": "...", "why": "..." }
  ],
  "food": {
    "cheap_eats":  [{ "name": "...", "order": "..." }],
    "date_night":  { "name": "...", "budget": "$50", "why": "..." },
    "breakfast":   { "name": "...", "why": "..." },
    "splurge":     { "name": "...", "why": "..." }
  },
  "travel_context": {
    "from_city": "Durham",
    "distance_hours": 8,
    "advice": "Consider flying or split the drive via Charlotte"
  },
  "practical": {
    "stay_in":    "...",
    "avoid":      "...",
    "best_time":  "...",
    "local_take": "..."
  }
}
```

`travel_context` is null if no home city is set.
`user_context` is injected from the user's onboarding profile.

---

## Decision 3 — Paywall

**Completely free. No limit. No per-user cap.**

Guides are the SEO and sharing engine. Free guides sell paid discovery.

---

## Decision 4 — Food section: cultural food intelligence

One disclaimer at the top of the food section only (not per restaurant):
> "AI recommendations — verify before visiting."

### If user is from India
Detected via: home_city being an Indian city OR past trips including India.

- Prioritise pure veg South Indian spots
- Mention dosa, idli, sambar specifically where available
- Flag cities with Tamil, Telugu, Kannada communities
- Note price in Indian rupee equivalent for intuitive comparison

### If user is from China
- Distinguish regional Chinese cuisine (Sichuan, Cantonese, Shanghainese)
- Flag authentic vs Americanised
- Note cities with strong Chinese communities

### If user is from Middle East
- Halal certification matters
- Hookah/shisha availability may be relevant
- Flag prayer facilities nearby for longer trips

---

## Build sequence (when ready)

1. Supabase table: `destination_guides`
   - `user_id`, `destination_slug`, `profile_hash`, `guide (jsonb)`, `generated_at`
2. `/app/api/guide/route.ts` — POST `{ destination }`, fetches profile, calls Claude Haiku, caches, returns guide JSON
3. `/app/guide/page.tsx` — sectioned display, collapsible sections, same dark aesthetic
4. Entry point on `/app/discover/page.tsx` — search input below header

---

## Notes

- Food specificity: named restaurant suggestions + single top-level disclaimer
- Claude model: Haiku (same as recommendations and deals)
- Caching: Supabase `destination_guides` table, keyed by user_id + destination_slug + profile_hash
- SEO potential: public guide URLs (no auth required to view) — consider later
