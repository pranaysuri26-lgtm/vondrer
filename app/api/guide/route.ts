import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export interface GuideNeighbourhood {
  name:       string
  vibe:       string   // 2-sentence character description
  best_for:   string   // who it suits and when
  dont_miss:  string   // one specific thing most visitors skip
  local_eat:  string   // one specific spot locals actually go to
}

export interface GuideFoodSpot {
  name:          string
  neighbourhood: string
  type:          string   // e.g. "tacos al pastor", "natural wine bar", "kopitiam"
  why:           string   // one line — why locals go, not tourists
  order_this:    string   // the specific thing to get
  price:         string   // e.g. "$", "$$", "$$$"
}

export interface GuideInsiderTip {
  tip:     string
  detail:  string
}

export interface LocalGuide {
  destination:   string
  country:       string
  state_province?: string
  intro:         string
  neighbourhoods: GuideNeighbourhood[]
  food_spots:    GuideFoodSpot[]
  insider_tips:  GuideInsiderTip[]
  skip_these:    string[]
}

const SYSTEM = `You are a local guide writer for Voya — a travel app that shows the side of cities most visitors never see.
Your voice: direct, specific, never generic. Zero filler. You write like a local friend who knows the city deeply.

RULES:
- Every spot must be real and specific — named places, specific dishes, actual neighbourhood names.
- Never write anything that could appear on TripAdvisor's front page or a generic travel blog.
- food_spots must be places locals genuinely eat — not restaurants that appear on every "best of" list.
- neighbourhoods must be described through what they feel like on foot, not their Wikipedia summary.
- insider_tips must be things a tourist would never figure out on their own.
- skip_these should be honest — specific tourist traps that locals actively avoid and why.
- All text should be punchy, specific, and under 2 sentences per field unless instructed otherwise.

OUTPUT: Return a single valid JSON object matching this schema exactly:
{
  "intro": "2-3 sentences. The soul of the city — what makes it unlike anywhere else.",
  "neighbourhoods": [
    {
      "name": "neighbourhood name",
      "vibe": "2 sentences. What it feels like to walk through it on a Tuesday afternoon.",
      "best_for": "one sentence — who it's perfect for and in what context",
      "dont_miss": "one specific thing — a street, market, viewpoint, or moment most visitors completely miss",
      "local_eat": "one specific named place locals eat at — not the famous one, the real one"
    }
  ],
  "food_spots": [
    {
      "name": "exact name of the place",
      "neighbourhood": "which neighbourhood",
      "type": "what kind of food/drink — be specific",
      "why": "one line — why locals go here, what makes it real",
      "order_this": "the specific thing to get",
      "price": "$" | "$$" | "$$$"
    }
  ],
  "insider_tips": [
    {
      "tip": "short title — 5 words max",
      "detail": "one specific, actionable sentence"
    }
  ],
  "skip_these": ["specific tourist trap — one line each including why locals avoid it"]
}

Return 4 neighbourhoods, 6 food spots, 5 insider tips, 3 skip_these items.
No markdown. No explanation before or after. Just the JSON object.`

export async function POST(req: NextRequest) {
  try {
    const { destination, country, state_province } = await req.json() as {
      destination:    string
      country:        string
      state_province?: string
    }

    if (!destination || !country) {
      return NextResponse.json({ error: 'destination and country required' }, { status: 400 })
    }

    const location = state_province
      ? `${destination}, ${state_province}, ${country}`
      : `${destination}, ${country}`

    const completion = await openai.chat.completions.create({
      model:       'gpt-4o',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Write a local intel guide for: ${location}

Focus entirely on what locals actually do — not what tourists come for.
The reader has likely already googled the basics. Skip everything that appears on the city's Wikipedia page.
Give them the city that exists underneath the tourist layer.`,
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw) as Omit<LocalGuide, 'destination' | 'country' | 'state_province'>

    const guide: LocalGuide = {
      destination,
      country,
      state_province: state_province || undefined,
      ...parsed,
    }

    return NextResponse.json(guide)
  } catch (err) {
    console.error('[Guide API]', err)
    return NextResponse.json({ error: 'Failed to generate guide' }, { status: 500 })
  }
}
