/**
 * Gemini Flash — real-time travel timing intelligence.
 *
 * Fires a Google-Search-grounded Gemini call before the main Claude
 * recommendation pass. Returns a short plain-text briefing that gets
 * injected into Claude's user prompt as <timing_intelligence> so
 * destination timing scores and event detection are seasonally accurate.
 *
 * Rules:
 *   - 5-second hard timeout via Promise.race — never blocks the main flow
 *   - Any failure returns null → Claude proceeds without the context
 *   - Only called on live Claude calls (not cache hits)
 */

import { GoogleGenerativeAI } from '@google/generative-ai'

interface TimingParams {
  homeCountry:   string
  travelScope:   string           // 'anywhere' | 'closer'
  tripTiming:    string | null    // 'next_month' | '2_3_months' | 'exploring' | 'specific' | null
  tripStartDate: string | null    // ISO 'YYYY-MM-DD'
  tripEndDate:   string | null    // ISO 'YYYY-MM-DD'
}

const TIMEOUT_MS = 5000

function travelWindowDescription(p: TimingParams): string {
  if (p.tripTiming === 'specific' && p.tripStartDate && p.tripEndDate) {
    return `${p.tripStartDate} to ${p.tripEndDate}`
  }
  if (p.tripTiming === 'next_month') return 'next month'
  if (p.tripTiming === '2_3_months') return 'in 2–3 months'
  return 'in the coming months'
}

function regionHints(homeCountry: string, travelScope: string): string {
  const c = homeCountry.toLowerCase()

  if (travelScope === 'closer') {
    if (/united states|usa|\bus\b/.test(c)) return 'Mexico, Caribbean, Central America, and USA domestic'
    if (/india/.test(c))                    return 'India domestic, Sri Lanka, Nepal, Thailand, Southeast Asia'
    if (/united kingdom|uk\b|britain/.test(c)) return 'Europe, North Africa, Turkey'
    if (/australia/.test(c))               return 'Australia, New Zealand, Southeast Asia, Pacific Islands'
    if (/singapore/.test(c))               return 'Southeast Asia, Japan, South Korea, Australia'
    return `destinations near ${homeCountry}`
  }

  // Global — give Gemini broad coverage to check
  return 'worldwide destinations — focus on Asia, Europe, Latin America, Africa, Middle East'
}

export async function fetchTimingContext(p: TimingParams): Promise<string | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    console.warn('[Gemini] GOOGLE_AI_API_KEY not set — skipping timing context')
    return null
  }

  const travelWindow = travelWindowDescription(p)
  const regions      = regionHints(p.homeCountry, p.travelScope)
  const today        = new Date().toISOString().slice(0, 10)

  const prompt = `Today is ${today}. A traveller from ${p.homeCountry} is planning to travel ${travelWindow}.

Search for and return CURRENT travel timing intelligence for ${regions}.

Provide a concise briefing covering:
1. FESTIVALS & EVENTS — up to 6 notable festivals or events happening during the travel window (name, destination, approximate dates, crowd level: local/mixed/tourist)
2. VISA UPDATES — any recently changed visa-free or eVisa arrangements for ${p.homeCountry} passport holders (especially in the past 6 months)
3. SEASONAL CONDITIONS — any destinations with unusual conditions, road closures, extreme weather, or "best time" windows opening/closing during this travel window
4. CURRENT ADVISORIES — any significant travel advisories or disruptions worth noting

Keep each point brief. Max 400 words total. Use bullet points. Only include genuinely current/relevant information found via search.`

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [{ googleSearch: {} } as never],
    })

    const race = Promise.race([
      model.generateContent(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini timing timeout')), TIMEOUT_MS)
      ),
    ])

    const result = await race
    const text   = result.response.text().trim()

    if (!text || text.length < 50) return null

    console.log('[Gemini] Timing context fetched:', text.length, 'chars')
    return text
  } catch (err) {
    console.warn('[Gemini] Timing fetch failed (non-blocking):', (err as Error).message)
    return null
  }
}
