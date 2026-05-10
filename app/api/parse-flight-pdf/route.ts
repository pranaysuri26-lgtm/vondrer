import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const maxDuration = 30

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

// Accepted MIME types
const ACCEPTED = new Set([
  'application/pdf',
  'image/jpeg', 'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
])

const EXTRACTION_PROMPT = `Extract all flight booking details from this document.
Return ONLY valid JSON. No explanation. No markdown.

Return this exact structure:
{
  "flights": [
    {
      "from_city": string or null,
      "from_airport": string or null,
      "from_iata": string or null,
      "to_city": string or null,
      "to_airport": string or null,
      "to_iata": string or null,
      "departure_date": "YYYY-MM-DD" or null,
      "departure_time": "HH:MM" or null,
      "arrival_date": "YYYY-MM-DD" or null,
      "arrival_time": "HH:MM" or null,
      "flight_number": string or null,
      "airline": string or null
    }
  ],
  "booking_reference": string or null,
  "passenger_count": number or null
}

Rules:
- Include ALL flights in the booking, including connections
- departure_time and arrival_time must use 24-hour HH:MM format
- departure_date and arrival_date must use YYYY-MM-DD format
- If you cannot find a field, return null — never guess
- If there are multiple passengers, still extract the flight details once`

// ─── POST /api/parse-flight-pdf ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
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
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parse multipart file ─────────────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  const mimeType = file.type || 'application/octet-stream'
  if (!ACCEPTED.has(mimeType)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${mimeType}. Please upload a PDF or image.` },
      { status: 400 }
    )
  }

  // File size limit: 10 MB
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Maximum 10 MB.' }, { status: 400 })
  }

  // ── Convert to base64 ─────────────────────────────────────────────────────────
  const buffer = await file.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const isPdf  = mimeType === 'application/pdf'

  // ── Build OpenAI message content ──────────────────────────────────────────────
  type ImageContentPart = {
    type: 'image_url'
    image_url: { url: string; detail: 'high' }
  }
  type FileContentPart = {
    type: 'file'
    file: { filename: string; file_data: string }
  }
  type TextContentPart = { type: 'text'; text: string }

  type ContentPart = ImageContentPart | FileContentPart | TextContentPart

  const content: ContentPart[] = []

  if (isPdf) {
    // GPT-4o supports inline PDF via file content type
    content.push({
      type: 'file',
      file: {
        filename:  'booking.pdf',
        file_data: `data:application/pdf;base64,${base64}`,
      },
    })
  } else {
    content.push({
      type:      'image_url',
      image_url: {
        url:    `data:${mimeType};base64,${base64}`,
        detail: 'high',
      },
    })
  }

  content.push({ type: 'text', text: EXTRACTION_PROMPT })

  // ── Call GPT-4o ───────────────────────────────────────────────────────────────
  try {
    const response = await openai.chat.completions.create({
      model:      'gpt-4o',
      max_tokens: 1000,
      messages:   [
        {
          role:    'user',
          content: content as OpenAI.Chat.Completions.ChatCompletionContentPart[],
        },
      ],
      response_format: { type: 'json_object' },
    })

    const raw = response.choices[0]?.message?.content?.trim() ?? ''

    let parsed: { flights: unknown[]; booking_reference: string | null; passenger_count: number | null }
    try {
      parsed = JSON.parse(raw)
      if (!Array.isArray(parsed.flights)) throw new Error('flights must be array')
    } catch {
      console.error('[parse-flight-pdf] Parse error:', raw.slice(0, 300))
      return NextResponse.json({ error: 'Could not extract flight details. Please enter them manually.' }, { status: 422 })
    }

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('[parse-flight-pdf] GPT-4o error:', err)
    return NextResponse.json({ error: 'Extraction failed. Please enter details manually.' }, { status: 500 })
  }
}
