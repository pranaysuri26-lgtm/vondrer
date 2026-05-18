import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const maxDuration = 30

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SmartStop {
  id:          string      // stable client-side id
  time:        string      // "9:45 AM"
  duration:    string      // "30 min"
  name:        string
  description: string
  tip:         string
  type:        string      // food | walk | viewpoint | activity | rest | transport
  done:        boolean
}

export interface SmartDayContext {
  current_time:  string | null   // "9:51 AM"
  end_time:      string | null   // "2:30 PM"
  end_place:     string | null   // "Boudin Bakery"
  completed:     string[]        // already-done places
  must_dos:      string[]        // must-visit
  group:         string | null   // "1 elderly person"
}

export interface SmartDayPlan {
  title:        string
  summary:      string
  stops:        SmartStop[]
  time_budget:  string          // "You have 4h 39min"
}

export interface SmartWeather {
  label:     string
  emoji:     string
  temp_high: number
  temp_low:  number
  rain_pct:  number
  unit:      string
}

export interface SmartDayResponse {
  plan:     SmartDayPlan
  weather:  SmartWeather | null
  context:  SmartDayContext
  location: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function weatherEmoji(code: number): string {
  if (code === 0)               return '☀️'
  if (code <= 2)                return '🌤️'
  if (code === 3)               return '☁️'
  if (code === 45 || code === 48) return '🌫️'
  if (code >= 51 && code <= 55) return '🌦️'
  if (code >= 61 && code <= 65) return '🌧️'
  if (code >= 71 && code <= 77) return '❄️'
  if (code >= 80 && code <= 82) return '🌦️'
  if (code >= 95)               return '⛈️'
  return '🌡️'
}

function weatherLabel(code: number): string {
  if (code === 0)               return 'Clear sky'
  if (code <= 2)                return 'Mostly clear'
  if (code === 3)               return 'Overcast'
  if (code === 45 || code === 48) return 'Foggy'
  if (code >= 51 && code <= 55) return 'Drizzle'
  if (code >= 61 && code <= 65) return 'Rainy'
  if (code >= 71 && code <= 77) return 'Snowy'
  if (code >= 80 && code <= 82) return 'Rain showers'
  if (code >= 95)               return 'Thunderstorms'
  return 'Variable'
}

// ─── POST /api/plan/day/smart ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { place, date, context } = await req.json() as {
    place:    string
    date:     string
    context?: string   // natural language: "it's 9:51 AM, Pier 39 done, end by 2:30 PM at Boudin, 1 elderly"
  }

  if (!place || !date) return NextResponse.json({ error: 'place and date required' }, { status: 400 })

  // ── Step 1: Geocode ───────────────────────────────────────────────────────
  const geoRes = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1`,
    { headers: { 'User-Agent': 'Vondrer-App/1.0 (getvondrer.com)' } }
  )
  const geoData = await geoRes.json() as Array<{ lat: string; lon: string; display_name: string }>
  const geo = geoData[0]
  if (!geo) return NextResponse.json({ error: `Location not found — try "${place}, [city name]"` }, { status: 404 })

  // ── Step 2: Weather + context parse in PARALLEL ───────────────────────────
  const [weatherData, parsedCtx] = await Promise.all([
    // Weather from Open-Meteo (free, no key)
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode` +
      `&timezone=auto&forecast_days=7`
    ).then(r => r.json() as Promise<{
      daily: {
        time:                          string[]
        temperature_2m_max:            number[]
        temperature_2m_min:            number[]
        precipitation_probability_max: number[]
        weathercode:                   number[]
      }
    }>).catch(() => null),

    // Parse the natural-language context (only if provided)
    context?.trim()
      ? openai.chat.completions.create({
          model:           'gpt-4o-mini',
          temperature:     0,
          max_tokens:      300,
          response_format: { type: 'json_object' },
          messages: [{
            role: 'system',
            content: `Extract day-planning context. Return JSON:
{
  "current_time": "9:51 AM" or null,
  "end_time": "2:30 PM" or null,
  "end_place": "Boudin Bakery" or null,
  "completed": ["Pier 39", "Ghirardelli Square"],
  "must_dos": ["cable car", "Lombard Street"],
  "group": "1 elderly person" or null
}`,
          }, { role: 'user', content: context }],
        }).then(r => JSON.parse(r.choices[0]?.message?.content ?? '{}') as SmartDayContext)
          .catch(() => null)
      : Promise.resolve(null),
  ])

  const ctx: SmartDayContext = parsedCtx ?? {
    current_time: null, end_time: null, end_place: null,
    completed: [], must_dos: [], group: null,
  }

  // Build compact weather note (no hourly = faster + smaller prompt)
  let weatherNote = ''
  let smartWeather: SmartWeather | null = null
  if (weatherData) {
    const idx = weatherData.daily.time.indexOf(date)
    if (idx >= 0) {
      const code     = weatherData.daily.weathercode[idx]
      const tempHigh = Math.round(weatherData.daily.temperature_2m_max[idx])
      const tempLow  = Math.round(weatherData.daily.temperature_2m_min[idx])
      const rain     = weatherData.daily.precipitation_probability_max[idx] ?? 0
      const label    = weatherLabel(code)
      weatherNote    = `${label}, high ${tempHigh}°C / low ${tempLow}°C, ${rain}% rain chance`
      smartWeather   = { label, emoji: weatherEmoji(code), temp_high: tempHigh, temp_low: tempLow, rain_pct: rain, unit: 'C' }
    }
  }

  // Build time budget string
  let timeBudget = ''
  if (ctx.current_time && ctx.end_time) {
    timeBudget = `Time available: ${ctx.current_time} → ${ctx.end_time}${ctx.end_place ? ` (must arrive at ${ctx.end_place} by ${ctx.end_time})` : ''}`
  } else if (ctx.current_time) {
    timeBudget = `Starting now at ${ctx.current_time}`
  }

  // ── Step 3: Generate plan ─────────────────────────────────────────────────
  const completion = await openai.chat.completions.create({
    model:           'gpt-4o-mini',
    temperature:     0.65,
    max_tokens:      1100,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'system',
      content: `You are a real-time day planner. Generate a practical, timed itinerary.

Rules:
- ONLY real named places at the location
- Times must flow logically with realistic travel + duration
- ${ctx.completed.length ? `SKIP these (already done): ${ctx.completed.join(', ')}` : ''}
- ${ctx.must_dos.length ? `MUST INCLUDE: ${ctx.must_dos.join(', ')}` : ''}
- ${ctx.group ? `Group: ${ctx.group} — adjust pace and access accordingly` : ''}
- ${ctx.end_place ? `MUST END at ${ctx.end_place} by ${ctx.end_time ?? 'end of plan'}` : ''}
- ${ctx.current_time ? `Start from ${ctx.current_time}, not earlier` : 'Start 9–10 AM'}
- "tip": practical local insight or weather note, never generic
- Weather: ${weatherNote || 'unknown'}

Return JSON:
{
  "title": "Your afternoon at [Place]",
  "summary": "One punchy weather-aware sentence",
  "time_budget": "You have X hours Y minutes",
  "stops": [
    { "time": "9:51 AM", "duration": "45 min", "name": "Exact real place", "description": "What to do specifically", "tip": "Local insight", "type": "food|walk|viewpoint|activity|rest|transport" }
  ]
}`,
    }, {
      role: 'user',
      content: `Location: ${place} (${geo.display_name})
Date: ${date}
${timeBudget}
${context ? `Context: ${context}` : ''}`,
    }],
  })

  const raw = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as SmartDayPlan

  // Inject stable IDs
  const plan: SmartDayPlan = {
    ...raw,
    stops: (raw.stops ?? []).map((s, i) => ({ ...s, id: `stop-${i}-${Date.now()}`, done: false })),
  }

  return NextResponse.json({ plan, weather: smartWeather, context: ctx, location: geo.display_name } satisfies SmartDayResponse)
}
