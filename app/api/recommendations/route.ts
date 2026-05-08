import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
  buildProfileHash,
  buildRecommendationPrompt,
  validateResponse,
  type OnboardingData,
  type PastTrip,
  type RecommendedDestination,
} from '@/lib/recommendations'

// Route segment config — 60s max (streaming avoids hitting this on normal loads)
export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

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

  const onboarding: OnboardingData = onboardingResult.data
  const pastTrips: PastTrip[]      = tripsResult.data || []
  const hash = buildProfileHash(onboarding, pastTrips)

  const meta = {
    home_country:        onboarding.home_country ?? '',
    home_city:           onboarding.home_city    ?? '',
    dietary_preferences: (onboarding.dietary_preferences ?? []).filter((p: string) => p !== 'none'),
  }

  // ── Exact cache hit ─────────────────────────────────────────────────────────
  if (!force_refresh) {
    const { data: exact } = await supabase
      .from('recommendations')
      .select('destinations')
      .eq('user_id', user.id)
      .eq('profile_hash', hash)
      .single()

    if (exact?.destinations) {
      return makeSSEResponse(async (ctrl) => {
        ctrl.enqueue(sseChunk({ type: 'meta', cached: true, ...meta }))
        for (const dest of exact.destinations as RecommendedDestination[]) {
          ctrl.enqueue(sseChunk({ type: 'destination', ...dest }))
        }
        ctrl.enqueue(sseChunk({ type: 'done' }))
      })
    }

    // Stale cache — return immediately, signal client to refresh in background
    const { data: stale } = await supabase
      .from('recommendations')
      .select('destinations')
      .eq('user_id', user.id)
      .single()

    if (stale?.destinations) {
      return makeSSEResponse(async (ctrl) => {
        ctrl.enqueue(sseChunk({ type: 'meta', stale: true, needs_refresh: true, ...meta }))
        for (const dest of stale.destinations as RecommendedDestination[]) {
          ctrl.enqueue(sseChunk({ type: 'destination', ...dest }))
        }
        ctrl.enqueue(sseChunk({ type: 'done' }))
      })
    }
  }

  // ── Live Claude call — streaming ────────────────────────────────────────────
  const { system, user: userPrompt } = buildRecommendationPrompt(onboarding, pastTrips)

  return makeSSEResponse(async (ctrl) => {
    ctrl.enqueue(sseChunk({ type: 'meta', ...meta }))

    const collected: RecommendedDestination[] = []

    // ── Attempt 1: true NDJSON streaming ─────────────────────────────────────
    let streamSucceeded = false
    try {
      // Use stream: true for async-iterable raw events
      const claudeStream = await anthropic.messages.create({
        model:      'claude-haiku-4-5',
        max_tokens: 3000,
        stream:     true,
        system,
        messages:   [{ role: 'user', content: userPrompt }],
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
            ctrl.enqueue(sseChunk({ type: 'destination', ...d }))
          }
        } catch { /* partial or non-destination line */ }
      }

      for await (const event of claudeStream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const chunk = event.delta.text
          lineBuffer += chunk
          fullText   += chunk

          // Emit complete lines as they arrive
          const lines = lineBuffer.split('\n')
          lineBuffer  = lines.pop() ?? ''
          for (const line of lines) tryParseLine(line)
        }
      }

      // Flush remaining buffer
      if (lineBuffer.trim()) tryParseLine(lineBuffer)

      // If NDJSON parsing yielded nothing, Claude may have used JSON array format
      if (collected.length === 0 && fullText.trim()) {
        try {
          const fallbackDests = validateResponse(fullText)
          for (const d of fallbackDests) {
            collected.push(d)
            ctrl.enqueue(sseChunk({ type: 'destination', ...d }))
          }
        } catch { /* fallback also failed — retry below */ }
      }

      streamSucceeded = collected.length >= 8
    } catch (streamErr) {
      console.warn('[Recommendations] Stream attempt 1 failed:', streamErr)
    }

    // ── Attempt 2: regular call fallback (rare) ───────────────────────────────
    if (!streamSucceeded) {
      // Tell the client to discard any partial results it already rendered
      if (collected.length > 0) {
        ctrl.enqueue(sseChunk({ type: 'retry' }))
        collected.length = 0
      }

      try {
        const response = await anthropic.messages.create({
          model:      'claude-haiku-4-5',
          max_tokens: 3000,
          system,
          messages:   [{ role: 'user', content: userPrompt }],
        })
        const raw = response.content[0].type === 'text' ? response.content[0].text : ''
        const retryDests = validateResponse(raw)
        for (const d of retryDests) {
          collected.push(d)
          ctrl.enqueue(sseChunk({ type: 'destination', ...d }))
        }
        streamSucceeded = true
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
        .single()

      if (stale?.destinations) {
        if (collected.length > 0) ctrl.enqueue(sseChunk({ type: 'retry' }))
        ctrl.enqueue(sseChunk({ type: 'meta', fallback: true, ...meta }))
        for (const d of stale.destinations as RecommendedDestination[]) {
          ctrl.enqueue(sseChunk({ type: 'destination', ...d }))
        }
      } else {
        ctrl.enqueue(sseChunk({ type: 'error', message: 'Recommendation engine temporarily unavailable' }))
      }

      ctrl.enqueue(sseChunk({ type: 'done' }))
      return
    }

    // ── Cache fresh results ───────────────────────────────────────────────────
    if (collected.length >= 8) {
      try {
        await supabase
          .from('recommendations')
          .upsert(
            {
              user_id:      user.id,
              destinations: collected,
              profile_hash: hash,
              generated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          )
      } catch (cacheErr) {
        console.warn('[Recommendations] Cache store failed:', cacheErr)
      }
    }

    ctrl.enqueue(sseChunk({ type: 'done' }))
  })
}
