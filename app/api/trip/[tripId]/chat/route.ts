import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 30

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ─── POST /api/trip/[tripId]/chat ─────────────────────────────────────────────
// Streaming Claude chat with full itinerary context.

export async function POST(req: NextRequest) {
  const { message, history, tripName, dests } = await req.json() as {
    message:  string
    history:  Array<{ role: 'user' | 'assistant'; content: string }>
    tripName: string
    dests:    Array<{
      destination_name: string
      country:          string
      start_date:       string
      end_date:         string
      itinerary_json:   Array<{
        day:       number
        title?:    string
        morning?:  { activity: string }
        afternoon?:{ activity: string }
        dinner?:   { activity: string }
        evening?:  { activity: string }
      }> | null
    }>
  }

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: 'message required' }), { status: 400 })
  }

  // Build compact context — avoid hitting token limits
  const context = dests.map(d => {
    const days = (d.itinerary_json ?? []).map(day =>
      `  Day ${day.day}: ${[
        day.morning?.activity,
        day.afternoon?.activity,
        day.dinner?.activity,
        day.evening?.activity,
      ].filter(Boolean).join(' → ')}`
    ).join('\n')
    return `${d.destination_name}, ${d.country} (${d.start_date}–${d.end_date})\n${days}`
  }).join('\n\n')

  const system = `You are Vondrer's AI travel assistant — knowledgeable, warm, and genuinely helpful.

Trip: "${tripName}"

Itinerary overview:
${context}

Guidelines:
- Answer logistics, restaurant tips, packing questions, route queries, what's near what
- When suggesting swaps, cite the specific day/slot: "I'd replace Day 2 Afternoon with..."
- Keep responses to 3–5 sentences unless a list genuinely helps
- Use **bold** for place names, bullets only for actual lists
- Add real local insight, not just echo the plan back`

  const messages: Anthropic.MessageParam[] = [
    ...(history ?? []).slice(-10).map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: message },
  ]

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      const stream = await anthropic.messages.create({
        model:      'claude-haiku-4-5',
        max_tokens: 700,
        system,
        messages,
        stream:     true,
      })
      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`))
        }
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
