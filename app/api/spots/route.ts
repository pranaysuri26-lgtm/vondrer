import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const dest    = searchParams.get('dest')    ?? ''
  const country = searchParams.get('country') ?? ''
  if (!dest) return NextResponse.json({ error: 'dest required' }, { status: 400 })

  const prompt = `You are a travel expert. For ${dest}, ${country} return ONLY valid JSON (no markdown):
{
  "must_see": [
    { "name": "Place name", "why": "One sentence why it's unmissable.", "type": "landmark|museum|nature|market|temple|beach|viewpoint" },
    ...3 items total
  ],
  "hidden_gems": [
    { "name": "Place name", "why": "One sentence why locals love it.", "type": "cafe|neighbourhood|viewpoint|market|beach|park|street" },
    ...3 items total
  ]
}`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}'
    const data = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim())
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate' }
    })
  } catch (e) {
    return NextResponse.json({ must_see: [], hidden_gems: [] })
  }
}
