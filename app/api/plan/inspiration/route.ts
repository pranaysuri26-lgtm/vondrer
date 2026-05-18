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
  } else if (body.url) {
    const isSocial = /instagram\.com|tiktok\.com|twitter\.com|x\.com/i.test(body.url)
    let pageText = ''

    if (!isSocial) {
      try {
        const fetched = await fetch(body.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Vondrer/1.0; +https://vondrer.com)' },
          signal: AbortSignal.timeout(8000),
        })
        if (fetched.ok) {
          const html = await fetched.text()
          // Strip tags, collapse whitespace, cap at 4000 chars to stay in token budget
          pageText = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim()
            .slice(0, 4000)
        }
      } catch { /* timeout or blocked — fall back to URL-only */ }
    }

    const prompt = pageText
      ? `Extract travel destination from this web page content:\n\n${pageText}`
      : isSocial
        ? `Extract travel destination from this social media URL (no page content available — infer from URL structure if possible): ${body.url}\n${body.text ?? ''}`
        : `Extract travel destination from this URL: ${body.url}\n${body.text ?? ''}`

    content.push({ type: 'text', text: prompt })
  } else {
    content.push({ type: 'text', text: body.text ?? '' })
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
