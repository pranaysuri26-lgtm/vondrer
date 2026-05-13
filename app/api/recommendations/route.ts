import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
  buildProfileHash,
  buildRecommendationPrompt,
  validateResponse,
  filterByScope,
  PROMPT_VERSION,
  type OnboardingData,
  type PastTrip,
  type RecommendedDestination,
} from '@/lib/recommendations'
import { fetchTimingContext } from '@/lib/gemini-timing'

// Route segment config — 60s max (streaming avoids hitting this on normal loads)
export const maxDuration = 60

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

// ─── Paywall enforcement ──────────────────────────────────────────────────────
// How many destinations are fully visible to free-tier users.
// Locked destinations are sent as stubs — real data never reaches the client.
const FREE_TIER_LIMIT = 3

/**
 * Sort destinations best-first, then strip sensitive fields from any destination
 * beyond FREE_TIER_LIMIT. Locked stubs retain only match_score + gem score
 * so the client can render "XX% match" teasers without exposing real content.
 */
function applyPaywall(dests: RecommendedDestination[]): RecommendedDestination[] {
  const sorted = [...dests].sort((a, b) => b.match_score - a.match_score)
  return sorted.map((d, i) => {
    if (i < FREE_TIER_LIMIT) return { ...d, locked: false }
    // Locked stub — real name/country/reasons/transport never sent to client
    return {
      name:             '████████',
      country:          '████████',
      state_province:   '',
      match_score:      d.match_score,
      hidden_gem_score: d.hidden_gem_score,
      locked:           true,
      // Zero out everything else
      reasons:          [],
      best_time:        '',
      budget_per_day:   '',
      description:      '',
      insider_tip:      '',
      timing_note:      '',
      timing_warning:   '',
      upcoming_event:   '',
      transport:        [],
    } as unknown as RecommendedDestination
  })
}

// ─── SSE helpers ──────────────────────────────────────────────────────────────

const enc = new TextEncoder()

function sseChunk(data: object): Uint8Array {
  return enc.encode(`data: ${JSON.stringify(data)}\n\n`)
}

/** Wrap an async function in a streaming SSE Response. */
function makeSSEResponse(
  fn: (ctrl: ReadableStreamDefaultController) => Promise<void>
): Response {
  const stream = new ReadableStream({
    async start(ctrl) {
      try {
        await fn(ctrl)
      } catch (err) {
        console.error('[Recommendations] Unhandled stream error:', err)
        try { ctrl.enqueue(sseChunk({ type: 'error', message: 'Internal server error' })) } catch { /* ignore */ }
        try { ctrl.enqueue(sseChunk({ type: 'done' })) } catch { /* ignore */ }
      } finally {
        try { ctrl.close() } catch { /* ignore */ }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

// ─── POST /api/recommendations ────────────────────────────────────────────────
//
// Always returns text/event-stream. Event types:
//   { type: 'meta',        home_country, dietary_preferences, cached?, stale?, needs_refresh?, fallback? }
//   { type: 'destination', ...RecommendedDestination }
//   { type: 'retry' }          — signals client to clear partial results (rare)
//   { type: 'error',       message }
//   { type: 'done' }
//
// Strategy (stale-while-revalidate, now streaming):
//   force_refresh: false  →  exact cache hit  → emit all cached dests + done
//                         →  stale cache       → emit stale + needs_refresh, client fires force_refresh
//                         →  no cache          → stream live Claude call
//   force_refresh: true   →  always call Claude fresh, stream progressively

export async function POST(req: NextRequest) {
  // ── Parse body ──────────────────────────────────────────────────────────────
  let force_refresh = false
  try {
    const body = await req.json()
    force_refresh = !!body?.force_refresh
  } catch { /* empty body — fine */ }

  // ── Auth + Supabase ─────────────────────────────────────────────────────────
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    // Can't stream a 401 as SSE — return plain JSON
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Admin accounts bypass the paywall entirely — all destinations sent fully unlocked.
  const ADMIN_EMAILS = [
    'pranaysuri26@gmail.com',   // owner — hardcoded as fallback
    ...(process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean),
  ]
  const isAdmin = ADMIN_EMAILS.includes((user.email ?? '').toLowerCase())
  console.log(`[Recommendations] user=${user.email} isAdmin=${isAdmin}`)

  // Use this instead of applyPaywall() everywhere in this request.
  const paywall = (dests: RecommendedDestination[]) =>
    isAdmin
      ? [...dests].sort((a, b) => b.match_score - a.match_score).map(d => ({ ...d, locked: false }))
      : applyPaywall(dests)

  // ── Fetch profile ───────────────────────────────────────────────────────────
  const [onboardingResult, tripsResult] = await Promise.all([
    supabase.from('onboarding_responses').select('*').eq('user_id', user.id).single(),
    supabase.from('past_trips').select('destination_name').eq('user_id', user.id),
  ])

  if (onboardingResult.error || !onboardingResult.data) {
    return new Response(JSON.stringify({ error: 'Onboarding not complete' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const raw = onboardingResult.data
  const onboarding: OnboardingData = {
    ...raw,
    trip_start_date:   raw.trip_start_date   ?? undefined,
    trip_end_date:     raw.trip_end_date     ?? undefined,
    trip_duration_days: raw.trip_duration_days ?? undefined,
  }
  const pastTrips: PastTrip[]      = tripsResult.data || []
  const hash = buildProfileHash(onboarding, pastTrips)

  const meta = {
    home_country:        onboarding.home_country ?? '',
    home_city:           onboarding.home_city    ?? '',
    travel_scope:        onboarding.travel_scope ?? 'anywhere',
    domestic_scope:      onboarding.domestic_scope ?? null,
    dietary_preferences: (onboarding.dietary_preferences ?? []).filter((p: string) => p !== 'none'),
  }

  // ── Cache lookup ─────────────────────────────────────────────────────────────
  //
  // Strategy:
  //   1. Exact hit  — same profile_hash + same prompt_version → serve immediately, no refresh
  //   2. Soft stale — same profile_hash but older prompt_version → serve immediately,
  //                   trigger background refresh (user sees results instantly, fresh AI
  //                   results swap in silently)
  //   3. Profile changed — different hash, same home_country + travel_scope → serve stale,
  //                        trigger background refresh
  //   4. Nothing at all → live AI call (first-time user)
  //
  // Importantly, the stale query always includes eq('travel_scope', currentScope), so
  // 'closer' users never see 'anywhere' results. It is safe to serve stale for all scopes.
  if (!force_refresh) {
    const currentScope = onboarding.travel_scope ?? 'anywhere'

    const { data: cached } = await supabase
      .from('recommendations')
      .select('destinations, profile_hash, prompt_version')
      .eq('user_id', user.id)
      .eq('home_country', onboarding.home_country ?? '')
      .eq('travel_scope', currentScope)
      .single()

    if (cached?.destinations) {
      const isExactProfile  = cached.profile_hash   === hash
      const isFreshVersion  = (cached.prompt_version ?? 0) >= PROMPT_VERSION
      const isExactHit      = isExactProfile && isFreshVersion

      return makeSSEResponse(async (ctrl) => {
        const paywalled = paywall(cached.destinations as RecommendedDestination[])
        ctrl.enqueue(sseChunk({
          type:          'meta',
          cached:        isExactHit,
          stale:         !isExactHit,
          needs_refresh: !isExactHit,
          total_count:   paywalled.length,
          ...meta,
        }))
        for (const dest of paywalled) {
          ctrl.enqueue(sseChunk({ type: 'destination', ...dest }))
        }
        ctrl.enqueue(sseChunk({ type: 'done' }))
      })
    }
  }

  // ── Live Claude call — streaming ────────────────────────────────────────────
  // FIX 4 — Debug: log the exact profile values being used before prompt build
  console.log('[Recommendations] Profile debug:', {
    home_city:    onboarding.home_city    ?? '(none)',
    home_country: onboarding.home_country ?? '(none)',
    travel_scope: onboarding.travel_scope ?? '(null → defaulting to anywhere)',
    hash_prefix:  hash.slice(0, 12),
  })

  // ── Gemini Flash: real-time timing intelligence ─────────────────────────────
  // Fires in parallel with nothing else — 5s timeout, never blocks if it fails.
  // Result injected into Claude's user prompt as <timing_intelligence> so
  // festival detection and timing scores are grounded in current search data.
  const timingContext = await fetchTimingContext({
    homeCountry:   onboarding.home_country ?? '',
    travelScope:   onboarding.travel_scope ?? 'anywhere',
    tripTiming:    onboarding.trip_timing  ?? null,
    tripStartDate: onboarding.trip_start_date ?? null,
    tripEndDate:   onboarding.trip_end_date   ?? null,
  }).catch(() => null)  // safety net — Gemini must never crash the recommendations flow

  const { system, user: baseUserPrompt } = buildRecommendationPrompt(onboarding, pastTrips)

  const userPrompt = timingContext
    ? `${baseUserPrompt}\n\n<timing_intelligence>\nThe following is real-time travel timing data retrieved via Google Search. Use it to inform timing_score, timing_note, timing_warning, and upcoming_event fields. Treat as authoritative for current events and conditions:\n${timingContext}\n</timing_intelligence>`
    : baseUserPrompt

  return makeSSEResponse(async (ctrl) => {
    ctrl.enqueue(sseChunk({ type: 'meta', ...meta }))

    const collected: RecommendedDestination[] = []

    // ── Attempt 1: streaming ─────────────────────────────────────────────────
    let streamSucceeded = false
    try {
      const gptStream = await openai.chat.completions.create({
        model:       'gpt-4o-mini',
        max_tokens:  8000,
        temperature: 0.7,
        stream:      true,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: userPrompt },
        ],
      })

      let lineBuffer = ''
      let fullText   = ''

      function tryParseLine(line: string) {
        const t = line.trim()
        if (!t) return
        try {
          const d = JSON.parse(t)
          if (d.name && d.country && typeof d.match_score === 'number') {
            collected.push(d)
          }
        } catch { /* partial or non-destination line */ }
      }

      for await (const chunk of gptStream) {
        const text = chunk.choices[0]?.delta?.content ?? ''
        if (!text) continue
        lineBuffer += text
        fullText   += text

        const lines = lineBuffer.split('\n')
        lineBuffer  = lines.pop() ?? ''
        for (const line of lines) tryParseLine(line)
      }

      // Flush remaining buffer
      if (lineBuffer.trim()) tryParseLine(lineBuffer)

      // Fallback: model may have returned a JSON array instead of NDJSON
      if (collected.length === 0 && fullText.trim()) {
        try {
          const fallbackDests = validateResponse(fullText)
          collected.push(...fallbackDests)
        } catch { /* fallback also failed — retry below */ }
      }

      if (collected.length >= 5) {
        const scopeFiltered = filterByScope(collected, onboarding.home_country ?? '', onboarding.travel_scope, onboarding.domestic_scope)
        const paywalled = paywall(scopeFiltered)
        for (const d of paywalled) {
          ctrl.enqueue(sseChunk({ type: 'destination', ...d }))
        }
      }

      streamSucceeded = collected.length >= 5
    } catch (streamErr) {
      console.warn('[Recommendations] Stream attempt 1 failed:', streamErr)
    }

    // ── Attempt 2: non-streaming fallback (rare) ──────────────────────────────
    if (!streamSucceeded) {
      collected.length = 0

      try {
        const response = await openai.chat.completions.create({
          model:       'gpt-4o-mini',
          max_tokens:  8000,
          temperature: 0.7,
          messages: [
            { role: 'system', content: system },
            { role: 'user',   content: userPrompt },
          ],
        })
        const raw = response.choices[0]?.message?.content ?? ''
        const retryDests = validateResponse(raw)
        collected.push(...retryDests)

        if (collected.length >= 5) {
          const scopeFiltered = filterByScope(collected, onboarding.home_country ?? '', onboarding.travel_scope, onboarding.domestic_scope)
          const paywalled = paywall(scopeFiltered)
          for (const d of paywalled) {
            ctrl.enqueue(sseChunk({ type: 'destination', ...d }))
          }
          streamSucceeded = true
        }
      } catch (retryErr) {
        console.error('[Recommendations] Both attempts failed:', retryErr)
      }
    }

    // ── Last resort: serve stale cache ────────────────────────────────────────
    if (!streamSucceeded) {
      const { data: stale } = await supabase
        .from('recommendations')
        .select('destinations')
        .eq('user_id', user.id)
        .eq('home_country', onboarding.home_country ?? '')
        .eq('travel_scope', onboarding.travel_scope ?? 'anywhere')
        .single()

      if (stale?.destinations) {
        ctrl.enqueue(sseChunk({ type: 'meta', fallback: true, ...meta }))
        const paywalled = paywall(stale.destinations as RecommendedDestination[])
        for (const d of paywalled) {
          ctrl.enqueue(sseChunk({ type: 'destination', ...d }))
        }
      } else {
        ctrl.enqueue(sseChunk({ type: 'error', message: 'Recommendation engine temporarily unavailable' }))
      }

      ctrl.enqueue(sseChunk({ type: 'done' }))
      return
    }

    // ── Cache fresh results ───────────────────────────────────────────────────
    // Cache the scope-filtered list so stale cache never contains forbidden destinations.
    // Threshold is 5 (not 8) so domestic/filtered scopes with fewer results still cache.
    const toCache = filterByScope(collected, onboarding.home_country ?? '', onboarding.travel_scope, onboarding.domestic_scope)
    if (toCache.length >= 5) {
      try {
        await supabase
          .from('recommendations')
          .upsert(
            {
              user_id:        user.id,
              destinations:   toCache,
              profile_hash:   hash,
              prompt_version: PROMPT_VERSION,
              home_country:   onboarding.home_country ?? '',
              travel_scope:   onboarding.travel_scope ?? 'anywhere',
              generated_at:   new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          )
      } catch (cacheErr) {
        console.warn('[Recommendations] Cache store failed:', cacheErr)
      }
    } else {
      console.warn(`[Recommendations] Cache skipped — only ${toCache.length} destinations after scope filter`)
    }

    ctrl.enqueue(sseChunk({ type: 'done' }))
  })
}
