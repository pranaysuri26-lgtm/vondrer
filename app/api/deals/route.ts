import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const maxDuration = 60

export interface Deal {
  id:               string
  category:         'flight' | 'hotel' | 'card' | 'alert'
  title:            string
  description:      string
  value:            string   // e.g. "Save up to 30%", "3× points"
  expires?:         string   // e.g. "May 31"
  action_label:     string
  action_url:       string
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

// In-process cache: key = "country::YYYY-MM-DD"
const cache = new Map<string, Deal[]>()

function todayKey(country: string) {
  const d = new Date().toISOString().slice(0, 10)
  return `${country.toLowerCase()}::${d}`
}

export async function GET() {
  try {
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
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // ── Get home country ──────────────────────────────────────────────────────
    const { data: onboarding } = await supabase
      .from('onboarding_responses')
      .select('home_country')
      .eq('user_id', user.id)
      .single()

    const country = onboarding?.home_country ?? 'Global'
    const key     = todayKey(country)

    // ── Return cached if already generated today ──────────────────────────────
    if (cache.has(key)) {
      return NextResponse.json({ deals: cache.get(key), cached: true, country })
    }

    // ── Generate with GPT-4o ──────────────────────────────────────────────────
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    const system = `You are a travel deals curator for Voya.
Return ONLY valid JSON. No explanation. No prose. No markdown fences.
Response schema: { "deals": [{ "id": string, "category": "flight"|"hotel"|"card"|"alert", "title": string, "description": string, "value": string, "expires": string|null, "action_label": string, "action_url": string }] }

RULES:
- Generate exactly 12 deals
- Mix categories: 4 flights, 3 hotels, 3 card bonuses, 2 travel alerts
- All deals must be relevant and accessible from ${country}
- Flights: real airline names, real route pairs plausible from ${country}, realistic % savings
- Hotels: real hotel chains or booking platforms, realistic discount percentages
- Cards: credit cards actually available in ${country}, real sign-up bonus language
- Alerts: travel news genuinely useful to ${country} travellers (visa changes, new routes, seasonal tips)
- value: short punchy string — "Save 35%", "60,000 bonus points", "New route", "Visa-free now"
- expires: realistic near-future date like "May 31" or "June 15", or null for alerts
- action_url: real relevant URL — Skyscanner, airline site, bank, booking.com, etc.
- action_label: 2-3 words — "Search flights", "Book now", "Apply today", "Read more"
- Deals must feel hand-curated, not generic — mention specific cities, airlines, chains`

    const userPrompt = `Generate today's travel deals for ${country} travellers. Today is ${today}.`

    const response = await openai.chat.completions.create({
      model:    'gpt-4o',
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: userPrompt },
      ],
      max_tokens:      2500,
      response_format: { type: 'json_object' },
    })

    const raw    = response.choices[0]?.message?.content ?? ''
    const parsed = JSON.parse(raw)

    if (!parsed.deals || !Array.isArray(parsed.deals)) {
      throw new Error('Invalid response structure')
    }

    const deals: Deal[] = parsed.deals.slice(0, 12)
    cache.set(key, deals)

    return NextResponse.json({ deals, cached: false, country })
  } catch (err) {
    console.error('[Deals] Error:', err)
    return NextResponse.json({ error: 'Could not load deals' }, { status: 500 })
  }
}
