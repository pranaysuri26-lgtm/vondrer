import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 20

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface VisaInfo {
  requirement:    'visa_free' | 'visa_on_arrival' | 'e_visa' | 'visa_required' | 'unknown'
  stay_days?:     number         // max stay in days
  summary:        string         // 1-sentence plain English
  steps?:         string[]       // action steps if visa needed
  cost?:          string         // e.g. "$50 per person"
  processing?:    string         // e.g. "3–5 business days"
  important?:     string         // passport validity, photos, etc.
  official_url?:  string         // embassy / e-visa portal link
  last_verified:  string         // ISO date — ALWAYS note this is AI-generated
}

// ─── GET /api/visa?from=US&to=Japan ──────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')?.trim()
  const to   = searchParams.get('to')?.trim()

  if (!from || !to)
    return NextResponse.json({ error: 'from and to params required' }, { status: 400 })

  if (from.toLowerCase() === to.toLowerCase())
    return NextResponse.json({ requirement: 'visa_free', summary: 'No visa needed — same country.', last_verified: new Date().toISOString().split('T')[0] } as VisaInfo)

  const system = `You are a travel visa expert. Return ONLY a JSON object with no markdown.`

  const user = `Nationality: ${from} passport holder
Destination: ${to}

Return this exact JSON:
{
  "requirement": "visa_free" | "visa_on_arrival" | "e_visa" | "visa_required" | "unknown",
  "stay_days": number or null,
  "summary": "One plain-English sentence (e.g. 'US passport holders can enter Japan visa-free for up to 90 days.')",
  "steps": ["Step 1", "Step 2"] or null,
  "cost": "$X per person" or null,
  "processing": "X business days" or null,
  "important": "Passport must be valid for 6 months beyond entry." or null,
  "official_url": "https://..." or null,
  "last_verified": "${new Date().toISOString().split('T')[0]}"
}

Be accurate. If unsure, use "unknown" for requirement and explain in summary.`

  try {
    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 500,
      system,
      messages:   [{ role: 'user', content: user }],
    })
    const raw  = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const data = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()) as VisaInfo
    return NextResponse.json(data)
  } catch (err) {
    console.error('[Visa]', err)
    return NextResponse.json({ error: 'Failed to fetch visa info' }, { status: 500 })
  }
}
