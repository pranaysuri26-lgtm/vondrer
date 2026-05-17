import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const maxDuration = 30

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface InspirationResult {
  destination:  string
  country:      string
  days:         number
  interests:    string[]
  budget:       string
  summary:      string   // 1-sentence "We detected…"
  confidence:   'high' | 'medium' | 'low'
}

// ─── POST /api/plan/inspiration ───────────────────────────────────────────────
// Accepts: { url?: string, text?: string, image_base64?: string, media_type?: string }
// Returns: InspirationResult to pre-fill the plan form.

export async function POST(req: NextRequest) {
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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    url?:           string
    text?:          string
    image_base64?:  string
    media_type?:    'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  }

  if (!body.url && !body.text && !body.image_base64)
    return NextResponse.json({ error: 'Provide url, text, or image_base64' }, { status: 400 })

  const system = `You are a travel destination extractor. Return ONLY a JSON object — no markdown.
JSON shape:
{
  "destination":  "City or region name",
  "country":      "Country in English",
  "days":         3,
  "interests":    ["food", "culture"],
  "budget":       "50-150",
  "summary":      "One sentence: what you detected and why.",
  "confidence":   "high" | "medium" | "low"
}
Budget tiers: "under-20" | "20-50" | "50-150" | "150-300" | "300+"
If you can't determine destination confidently, use confidence "low" and best guess.`

  type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  type ContentBlock =
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: ImageMediaType; data: string } }

  const content: ContentBlock[] = []

  if (body.image_base64) {
    content.push({
      type:   'image',
      source: {
        type:       'base64',
        media_type: body.media_type ?? 'image/jpeg',
        data:       body.image_base64,
      },
    })
    content.push({ type: 'text', text: 'Extract travel destination info from this image.' })
  } else {
    const userText = body.url
      ? `Extract travel destination from this URL or caption: ${body.url}\n${body.text ?? ''}`
      : (body.text ?? '')
    content.push({ type: 'text', text: userText })
  }

  try {
    const msg = await anthropic.messages.create({
      model:    body.image_base64 ? 'claude-haiku-4-5' : 'claude-haiku-4-5',
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content }],
    })
    const raw  = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}'
    const data = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()) as InspirationResult
    return NextResponse.json(data)
  } catch (err) {
    console.error('[Inspiration]', err)
    return NextResponse.json({ error: 'Could not extract destination info.' }, { status: 500 })
  }
}
