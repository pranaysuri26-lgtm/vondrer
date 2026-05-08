import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
  buildProfileHash,
  buildRecommendationPrompt,
  validateResponse,
  type OnboardingData,
  type PastTrip,
} from '@/lib/recommendations'

// Route segment config — must be after imports
// Extends Vercel function timeout to 60s (default is 10s on Hobby plan)
export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ─── POST /api/recommendations ────────────────────────────────────────────────
// Stale-while-revalidate strategy:
//
// First call  (force_refresh: false, default):
//   - Exact hash match  → return cached, done
//   - Stale cache exists → return stale immediately + needs_refresh: true
//   - No cache at all   → call Claude, store, return fresh
//
// Second call (force_refresh: true) — fired by the client in the background
// after it already has stale results on screen:
//   - Always call Claude, store fresh results, return them
//
// This means returning users NEVER see a spinner or timeout error.
// New users still wait for Claude once (first-ever visit).

export async function POST(req: NextRequest) {
  try {
    // ── Parse body ────────────────────────────────────────────────────────────
    let force_refresh = false
    try {
      const body = await req.json()
      force_refresh = !!body?.force_refresh
    } catch {
      // body is empty — that's fine, use defaults
    }

    // ── Auth ──────────────────────────────────────────────────────────────────
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Fetch profile inputs ──────────────────────────────────────────────────
    const [onboardingResult, tripsResult] = await Promise.all([
      supabase
        .from('onboarding_responses')
        .select('*')
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('past_trips')
        .select('destination_name')
        .eq('user_id', user.id),
    ])

    if (onboardingResult.error || !onboardingResult.data) {
      return NextResponse.json({ error: 'Onboarding not complete' }, { status: 400 })
    }

    const onboarding: OnboardingData = onboardingResult.data
    const pastTrips: PastTrip[]      = tripsResult.data || []

    const hash = buildProfileHash(onboarding, pastTrips)
    const meta = {
      home_country:        onboarding.home_country ?? '',
      dietary_preferences: (onboarding.dietary_preferences ?? []).filter((p: string) => p !== 'none'),
    }

    // ── Exact cache hit (and not forcing a refresh) ───────────────────────────
    if (!force_refresh) {
      const { data: exact } = await supabase
        .from('recommendations')
        .select('destinations')
        .eq('user_id', user.id)
        .eq('profile_hash', hash)
        .single()

      if (exact?.destinations) {
        return NextResponse.json({ destinations: exact.destinations, cached: true, ...meta })
      }

      // No exact match — look for any stale result to return immediately
      const { data: stale } = await supabase
        .from('recommendations')
        .select('destinations')
        .eq('user_id', user.id)
        .single()

      if (stale?.destinations) {
        // Return stale results right now. Client will fire force_refresh in background.
        return NextResponse.json({
          destinations:  stale.destinations,
          cached:        false,
          stale:         true,
          needs_refresh: true,
          ...meta,
        })
      }

      // First-ever visit: no stale cache — fall through to Claude call below
    }

    // ── Call Claude ───────────────────────────────────────────────────────────
    const { system, user: userPrompt } = buildRecommendationPrompt(onboarding, pastTrips)

    let destinations = null

    // Attempt 1
    try {
      const response = await anthropic.messages.create({
        model:      'claude-haiku-4-5',
        max_tokens: 2000,
        system,
        messages:   [{ role: 'user', content: userPrompt }],
      })

      const raw = response.content[0].type === 'text' ? response.content[0].text : ''
      destinations = validateResponse(raw)
    } catch (firstErr) {
      console.warn('[Recommendations] First attempt failed:', firstErr)

      // Attempt 2 — retry once
      try {
        const retry = await anthropic.messages.create({
          model:      'claude-haiku-4-5',
          max_tokens: 2000,
          system,
          messages:   [{ role: 'user', content: userPrompt }],
        })

        const raw = retry.content[0].type === 'text' ? retry.content[0].text : ''
        destinations = validateResponse(raw)
      } catch (secondErr) {
        console.error('[Recommendations] Both attempts failed:', secondErr)

        // Last resort — return whatever stale cache exists
        const { data: stale } = await supabase
          .from('recommendations')
          .select('destinations')
          .eq('user_id', user.id)
          .single()

        if (stale?.destinations) {
          return NextResponse.json({ destinations: stale.destinations, fallback: true, ...meta })
        }

        return NextResponse.json(
          { error: 'Recommendation engine temporarily unavailable' },
          { status: 503 }
        )
      }
    }

    // ── Store fresh results ───────────────────────────────────────────────────
    await supabase
      .from('recommendations')
      .upsert(
        { user_id: user.id, destinations, profile_hash: hash, generated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )

    return NextResponse.json({ destinations, cached: false, ...meta })
  } catch (err) {
    console.error('[Recommendations] Unhandled error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
