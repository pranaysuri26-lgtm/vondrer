import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'

export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ─── Perplexity — live deals/offers lookup ────────────────────────────────────

function isDealsQuestion(msg: string): boolean {
  const lower = msg.toLowerCase()
  return ['deal', 'offer', 'promotion', 'discount', 'free night', 'bonus point',
    'sign.up bonus', 'current offer', 'right now', 'this month', 'limited time',
    'cashback', 'miles bonus', 'reward', 'welcome bonus',
  ].some(kw => lower.includes(kw))
}

async function askPerplexity(message: string, homeCountry: string): Promise<string> {
  const context = homeCountry ? ` The user is from ${homeCountry}.` : ''
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model:    'sonar',
      messages: [
        {
          role:    'system',
          content: `You are a travel and credit card deals expert.${context} Answer questions about current credit card offers, hotel promotions, airline deals, and loyalty program bonuses. Be specific with card names, offer amounts, and expiry dates where known. Keep answers to 4-6 sentences.`,
        },
        { role: 'user', content: message },
      ],
      max_tokens: 512,
    }),
  })
  if (!res.ok) throw new Error(`Perplexity ${res.status}`)
  const data = await res.json() as { choices: Array<{ message: { content: string } }> }
  return data.choices[0]?.message?.content ?? ''
}

// ─── Quick itinerary generator (Claude Haiku, no HTTP round-trip) ──────────────

async function generateItinerary(destination: string, country: string, days: number, interests: string[]) {
  const prompt = `Generate a ${days}-day travel itinerary for ${destination}, ${country}.
Interests: ${interests.join(', ')}.
Return ONLY a valid JSON array — no markdown, no explanation. Each element:
{
  "day": 1,
  "title": "Descriptive day title",
  "morning":   { "activity": "...", "description": "2 sentences.", "insider_tip": "...", "estimated_cost": "$X", "start_time": "09:00", "end_time": "12:00" },
  "afternoon": { "activity": "...", "description": "2 sentences.", "insider_tip": "...", "estimated_cost": "$X", "start_time": "13:00", "end_time": "17:30" },
  "dinner":    { "activity": "Restaurant name + dish", "description": "2 sentences.", "insider_tip": "...", "estimated_cost": "$X", "start_time": "19:00", "end_time": "20:30" },
  "evening":   { "activity": "...", "description": "2 sentences.", "insider_tip": "...", "estimated_cost": "$X", "start_time": "21:00", "end_time": "23:00" },
  "day_total_estimate": "$X–Y"
}`

  const msg = await anthropic.messages.create({
    model:      'claude-haiku-4-5',
    max_tokens: 4096,
    messages:   [{ role: 'user', content: prompt }],
  })

  const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '[]'
  return JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim())
}

// ─── POST /api/ask ─────────────────────────────────────────────────────────────
// Global conversational endpoint. Streams a response. When the user asks to plan
// a trip, Claude appends <TRIP_JSON>{…}</TRIP_JSON> and the server auto-generates
// + saves the itinerary, emitting a trip_created SSE event.

export async function POST(req: NextRequest) {
  // Auth
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => {
          try { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) }
          catch { /* read-only */ }
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const { message, history, pageContext } = await req.json() as {
    message:      string
    history:      Array<{ role: 'user' | 'assistant'; content: string }>
    pageContext?: string
  }

  if (!message?.trim()) return new Response(JSON.stringify({ error: 'message required' }), { status: 400 })

  // Fetch user's home country for localised card recommendations
  let homeCountry = ''
  try {
    const { data: profile } = await supabase
      .from('onboarding_responses')
      .select('home_country')
      .eq('user_id', user.id)
      .single()
    homeCountry = profile?.home_country ?? ''
  } catch { /* non-fatal */ }

  const system = `You are Vondrer, a warm and knowledgeable AI travel assistant.
${pageContext ? `The user is currently on: ${pageContext}` : ''}
${homeCountry ? `The user is from ${homeCountry} — recommend credit cards, banks, and loyalty programs available in ${homeCountry}. Do not recommend US-only cards like Chase Sapphire to non-US users.` : ''}

ITINERARY CREATION — when the user asks you to plan/create/build a trip or itinerary (e.g. "plan me 5 days in Tokyo", "create a Paris trip", "I want to visit Bali for a week"):
1. Respond with 2–3 enthusiastic sentences about the destination and what you're building.
2. Immediately after your last sentence (no newline), append this exact tag:
<TRIP_JSON>{"destination":"City","country":"Country name in English","days":N,"interests":["food","culture","sightseeing"]}</TRIP_JSON>
- Infer interests from context; default to ["sightseeing","food","culture"] if unspecified
- Default to 5 days if duration not mentioned
- Use the city name for destination, full country name for country

ALL OTHER QUESTIONS (packing, visas, tips, restaurants, comparisons, credit cards, hotel deals, flights, loyalty programs, what to see):
- Answer helpfully in 3–5 sentences
- Use **bold** for place names, card names, and key tips
- For credit card / points questions: recommend specific well-known cards (Chase Sapphire, Amex Platinum, Capital One Venture etc), mention current offers if commonly known, and suggest checking the card's travel portal
- Never append <TRIP_JSON> unless they explicitly want an itinerary created
- Be specific — real places, real cards, real tips, not generic advice`

  const messages: Anthropic.MessageParam[] = [
    ...(history ?? []).slice(-8).map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: message },
  ]

  const encoder = new TextEncoder()

  // ── Route deal/offer questions to Perplexity for live data ──────────────────
  if (isDealsQuestion(message) && process.env.PERPLEXITY_API_KEY) {
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const answer = await askPerplexity(message, homeCountry)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: answer })}\n\n`))
        } catch {
          // Fallback to Claude if Perplexity fails
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: 'I couldn\'t fetch live deals right now — try checking the card issuer\'s website directly for current offers.' })}\n\n`))
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    return new Response(readable, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    })
  }

  const readable = new ReadableStream({
    async start(controller) {
      let fullText = ''

      try {
        // ── Stream Claude's conversational response ──────────────────────────
        const stream = await anthropic.messages.create({
          model:      'claude-haiku-4-5',
          max_tokens: 1024,
          system,
          messages,
          stream:     true,
        })

        // We buffer text and only flush up to (but not including) the <TRIP_JSON> tag.
        // Because the tag arrives across multiple chunks we can't strip per-chunk.
        let sendBuffer = ''

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText    += event.delta.text
            sendBuffer  += event.delta.text

            // If the tag has fully arrived, flush everything before it and stop
            if (sendBuffer.includes('<TRIP_JSON>')) {
              const safe = sendBuffer.split('<TRIP_JSON>')[0]
              if (safe) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: safe })}\n\n`))
              sendBuffer = '' // discard the rest — tag + JSON payload
              break
            }

            // If we might be mid-tag (e.g. buffer ends with '<TRIP_' or '<TRIP_JS'),
            // hold back the tail in case the next chunk completes the tag
            const tagStart = sendBuffer.lastIndexOf('<')
            if (tagStart !== -1 && '<TRIP_JSON>'.startsWith(sendBuffer.slice(tagStart))) {
              // flush everything before the potential tag start, hold the rest
              const safe = sendBuffer.slice(0, tagStart)
              if (safe) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: safe })}\n\n`))
              sendBuffer = sendBuffer.slice(tagStart)
            } else {
              // No tag risk — flush the whole buffer
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: sendBuffer })}\n\n`))
              sendBuffer = ''
            }
          }
        }

        // Flush any remaining safe text (no tag found at all)
        if (sendBuffer && !sendBuffer.includes('<TRIP_JSON>')) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: sendBuffer })}\n\n`))
        }

        // ── Detect itinerary intent ──────────────────────────────────────────
        const tripMatch = fullText.match(/<TRIP_JSON>([\s\S]+?)<\/TRIP_JSON>/)
        if (tripMatch) {
          const params = JSON.parse(tripMatch[1]) as {
            destination: string
            country:     string
            days:        number
            interests:   string[]
          }

          // Generate itinerary with Claude (inline, no HTTP round-trip)
          const itinerary = await generateItinerary(
            params.destination, params.country, params.days, params.interests
          )

          // Save trip + destination to DB using service-role client
          const serviceClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
          )

          const today     = new Date()
          const startDate = new Date(today.getFullYear(), today.getMonth() + 1, 1)
            .toISOString().split('T')[0]
          const endDate   = new Date(today.getFullYear(), today.getMonth() + 1, params.days)
            .toISOString().split('T')[0]
          const shareToken = randomBytes(16).toString('hex')
          const tripName   = `${params.destination} — ${params.days} days`

          const { data: trip } = await serviceClient
            .from('trips')
            .insert({
              user_id:    user.id,
              trip_name:  tripName,
              status:     'planning',
              total_days: params.days,
              start_date: startDate,
              end_date:   endDate,
              share_token: shareToken,
            })
            .select()
            .single()

          if (trip) {
            await serviceClient.from('trip_destinations').insert({
              trip_id:          trip.id,
              destination_name: params.destination,
              country:          params.country,
              position:         1,
              days:             params.days,
              start_date:       startDate,
              end_date:         endDate,
              itinerary_json:   itinerary,
            })

            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: 'trip_created', token: trip.share_token, name: tripName })}\n\n`
            ))
          }
        }
      } catch (err) {
        console.error('[Ask]', err)
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ text: 'Sorry, something went wrong. Please try again.' })}\n\n`
        ))
      }

      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
