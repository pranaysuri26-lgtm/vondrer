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
// 1. Validate auth
// 2. Fetch onboarding + past trips
// 3. Hash profile — serve cache if hit
// 4. Call Claude — validate response — store to DB
// 5. Return destinations

export async function POST(req: NextRequest) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
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

    // ── Fetch profile inputs ─────────────────────────────────────────────────
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
    const pastTrips: PastTrip[] = tripsResult.data || []

    // ── Cache check ──────────────────────────────────────────────────────────
    const hash = buildProfileHash(onboarding, pastTrips)

    const { data: cached } = await supabase
      .from('recommendations')
      .select('destinations')
      .eq('user_id', user.id)
      .eq('profile_hash', hash)
      .single()

    const meta = { home_country: onboarding.home_country ?? '' }

    // Cache hit — return immediately, no Claude call, generated_at unchanged
    if (cached?.destinations) {
      return NextResponse.json({ destinations: cached.destinations, cached: true, ...meta })
    }

    // ── Call Claude ──────────────────────────────────────────────────────────
    const { system, user: userPrompt } = buildRecommendationPrompt(onboarding, pastTrips)

    let destinations = null

    // Attempt 1
    try {
      const response = await anthropic.messages.create({
        model:      'claude-haiku-4-5',
        max_tokens: 1500,
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
          max_tokens: 1500,
          system,
          messages:   [{ role: 'user', content: userPrompt }],
        })

        const raw = retry.content[0].type === 'text' ? retry.content[0].text : ''
        destinations = validateResponse(raw)
      } catch (secondErr) {
        console.error('[Recommendations] Both attempts failed:', secondErr)

        // Fallback — return cached result ignoring hash (stale but better than blank screen)
        const { data: stale } = await supabase
          .from('recommendations')
          .select('destinations')
          .eq('user_id', user.id)
          .single()

        if (stale?.destinations) {
          return NextResponse.json({ destinations: stale.destinations, fallback: true, ...meta })
        }

        console.error('[Recommendations] Both attempts failed:', secondErr)
        return NextResponse.json(
          { error: 'Recommendation engine temporarily unavailable' },
          { status: 503 }
        )
      }
    }

    // ── Store to DB (upsert — UNIQUE on user_id) ──────────────────────────────
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
