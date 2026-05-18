import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const maxDuration = 30

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

// ─── WMO weather code → human label + emoji ───────────────────────────────────
function describeWeatherCode(code: number): { label: string; emoji: string } {
  if (code === 0)                        return { label: 'Clear sky',        emoji: '☀️'  }
  if (code === 1)                        return { label: 'Mostly clear',     emoji: '🌤️'  }
  if (code === 2)                        return { label: 'Partly cloudy',    emoji: '⛅'  }
  if (code === 3)                        return { label: 'Overcast',         emoji: '☁️'  }
  if (code === 45 || code === 48)        return { label: 'Foggy',            emoji: '🌫️'  }
  if (code >= 51 && code <= 55)         return { label: 'Drizzle',          emoji: '🌦️'  }
  if (code >= 61 && code <= 65)         return { label: 'Rainy',            emoji: '🌧️'  }
  if (code >= 71 && code <= 77)         return { label: 'Snowy',            emoji: '❄️'  }
  if (code >= 80 && code <= 82)         return { label: 'Rain showers',     emoji: '🌦️'  }
  if (code === 95)                       return { label: 'Thunderstorms',    emoji: '⛈️'  }
  if (code >= 96)                        return { label: 'Heavy storms',     emoji: '⛈️'  }
  return { label: 'Variable', emoji: '🌡️' }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DayStop {
  time:        string   // "9:00 AM"
  name:        string   // "Lone Cypress Viewpoint"
  duration:    string   // "30 min"
  description: string   // what to do
  tip:         string   // weather-specific or local insight
  type:        string   // viewpoint | food | walk | activity | drive | rest
}

export interface DayPlan {
  title:        string
  summary:      string
  weather_note: string
  stops:        DayStop[]
  practical: {
    entry_fee:       string
    parking:         string
    best_time_note:  string
  }
}

export interface DayWeather {
  label:      string
  emoji:      string
  temp_high:  number
  temp_low:   number
  rain_pct:   number
  sunrise:    string
  sunset:     string
  unit:       string   // 'C' | 'F'
}

export interface DayPlanResponse {
  plan:     DayPlan
  weather:  DayWeather
  location: string   // resolved display name
}

// ─── POST /api/plan/day ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
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

  // ── Parse body ────────────────────────────────────────────────────────────────
  const { place, date, home_city, group_type } = await req.json() as {
    place:       string
    date:        string   // YYYY-MM-DD
    home_city?:  string
    group_type?: string
  }

  if (!place || !date) {
    return NextResponse.json({ error: 'place and date required' }, { status: 400 })
  }

  // ── 1. Geocode the place via Nominatim (with fallback strategies) ────────────
  type GeoResult = Array<{ lat: string; lon: string; display_name: string }>

  async function nominatim(q: string): Promise<GeoResult> {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=0`,
      { headers: { 'User-Agent': 'Vondrer-App/1.0 (getvondrer.com)' } }
    )
    return r.json()
  }

  // Try progressively simpler queries until one works
  const queries = [
    place,                                              // exact as typed
    place.replace(/warf/gi, "wharf"),                  // fix common misspelling
    place.split(',')[0].trim(),                        // just the place, no city
    place.replace(/[''']/g, "'").split(',')[0].trim(), // normalise apostrophes
  ]

  let geoData: GeoResult = []
  for (const q of queries) {
    geoData = await nominatim(q)
    if (geoData.length) break
  }

  if (!geoData.length) {
    return NextResponse.json({ error: 'Location not found — try adding a city name (e.g. "Fisherman\'s Wharf, San Francisco")' }, { status: 404 })
  }

  const { lat, lon, display_name } = geoData[0]

  // ── 2. Fetch weather from Open-Meteo (free, no key) ───────────────────────────
  const weatherRes = await fetch(
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode,sunrise,sunset` +
    `&hourly=temperature_2m,precipitation_probability,weathercode` +
    `&timezone=auto&forecast_days=7`
  )
  const weatherData = await weatherRes.json() as {
    daily: {
      time:                            string[]
      temperature_2m_max:              number[]
      temperature_2m_min:              number[]
      precipitation_probability_max:   number[]
      weathercode:                     number[]
      sunrise:                         string[]
      sunset:                          string[]
    }
    hourly: {
      time:                    string[]
      temperature_2m:          number[]
      precipitation_probability: number[]
      weathercode:             number[]
    }
  }

  const dateIdx    = weatherData.daily.time.indexOf(date)
  const dayWeather = dateIdx >= 0 ? {
    code:     weatherData.daily.weathercode[dateIdx],
    tempHigh: Math.round(weatherData.daily.temperature_2m_max[dateIdx]),
    tempLow:  Math.round(weatherData.daily.temperature_2m_min[dateIdx]),
    rain:     weatherData.daily.precipitation_probability_max[dateIdx] ?? 0,
    sunrise:  (weatherData.daily.sunrise[dateIdx]  ?? '').split('T')[1] ?? '',
    sunset:   (weatherData.daily.sunset[dateIdx]   ?? '').split('T')[1] ?? '',
  } : null

  // Build hourly summary for the day (9am–9pm)
  let hourlyContext = ''
  if (dateIdx >= 0) {
    const dayHours = weatherData.hourly.time
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.startsWith(date) && parseInt(t.split('T')[1]) >= 9 && parseInt(t.split('T')[1]) <= 21)
    hourlyContext = dayHours
      .map(({ i }) => {
        const hour = weatherData.hourly.time[i].split('T')[1]
        const temp = Math.round(weatherData.hourly.temperature_2m[i])
        const rain = weatherData.hourly.precipitation_probability[i]
        const { label } = describeWeatherCode(weatherData.hourly.weathercode[i])
        return `${hour}: ${temp}°C, ${label}, ${rain}% rain`
      })
      .join('\n')
  }

  const { label: weatherLabel, emoji: weatherEmoji } = describeWeatherCode(dayWeather?.code ?? 0)

  const weatherSummary = dayWeather
    ? `${weatherLabel} — high ${dayWeather.tempHigh}°C / low ${dayWeather.tempLow}°C — ${dayWeather.rain}% rain chance — sunrise ${dayWeather.sunrise} / sunset ${dayWeather.sunset}`
    : 'Weather data unavailable'

  // ── 3. Generate the day plan with OpenAI ─────────────────────────────────────
  const systemPrompt = `You are Vondrer's spontaneous day planner. Generate a specific, timed itinerary for one day at a real place.

Rules:
- All stops must be REAL, named places within or directly part of the destination
- Times must flow logically and account for travel between stops
- Start between 8:30am–10am depending on place type (scenic drives start earlier, museums later)
- Include meal breaks at natural points — name a specific nearby restaurant or café
- Weather-reactive: if fog, suggest arriving after it lifts; if rain, add shelter tips; if golden hour timing matters, note the exact time
- Duration should be realistic — don't cram too many stops
- "tip" field must be specific — either weather-based OR a local insider tip, never generic

Stop types: viewpoint | food | walk | activity | drive | rest

Return ONLY valid JSON — no markdown:
{
  "title": "Your day at [Place Name]",
  "summary": "One punchy sentence: weather-aware overview of the day",
  "weather_note": "The single most important weather insight (fog lifting time, golden hour, rain window, etc.)",
  "stops": [
    {
      "time": "9:00 AM",
      "name": "Exact real place name",
      "duration": "45 min",
      "description": "Specifically what to do here — not generic",
      "tip": "Weather-specific tip OR local insight",
      "type": "viewpoint"
    }
  ],
  "practical": {
    "entry_fee": "e.g. $12.50 per vehicle or Free",
    "parking": "specific parking info",
    "best_time_note": "one line on timing or conditions"
  }
}`

  const userPrompt = `Plan a day at: ${place}
Resolved location: ${display_name}
Date: ${date}
Weather: ${weatherSummary}

Hourly breakdown (9am–9pm):
${hourlyContext || 'Not available'}

${home_city ? `Traveler is based in: ${home_city}` : ''}
${group_type ? `Group: ${group_type}` : ''}

Generate a complete, specific day plan. Stops should flow geographically. Include 5–8 stops.`

  try {
    const completion = await openai.chat.completions.create({
      model:           'gpt-4o-mini',
      temperature:     0.7,
      max_tokens:      2000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
    })

    const plan = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as DayPlan

    return NextResponse.json({
      plan,
      weather: {
        label:     weatherLabel,
        emoji:     weatherEmoji,
        temp_high: dayWeather?.tempHigh ?? 0,
        temp_low:  dayWeather?.tempLow  ?? 0,
        rain_pct:  dayWeather?.rain     ?? 0,
        sunrise:   dayWeather?.sunrise  ?? '',
        sunset:    dayWeather?.sunset   ?? '',
        unit:      'C',
      },
      location: display_name,
    } satisfies DayPlanResponse)

  } catch (err) {
    console.error('[plan/day]', err)
    return NextResponse.json({ error: 'Failed to generate day plan' }, { status: 500 })
  }
}
