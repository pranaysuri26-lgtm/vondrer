import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

export const metadata: Metadata = { title: 'Trip Templates — Voya' }
export const revalidate = 3600   // re-fetch every hour

const CATEGORIES = ['beach','city','adventure','culture','foodie','romantic','family','backpacker']

interface Template {
  id:               string
  title:            string
  description:      string | null
  destination_name: string
  country:          string
  days:             number
  category:         string[]
  copies:           number
  views:            number
  created_at:       string
}

async function getTemplates(): Promise<Template[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data } = await supabase
    .from('trip_templates')
    .select('id, title, description, destination_name, country, days, category, copies, views, created_at')
    .eq('is_public', true)
    .order('copies', { ascending: false })
    .limit(30)
  return data ?? []
}

export default async function TemplatesPage() {
  const templates = await getTemplates()

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <div className="max-w-3xl mx-auto px-4 pt-12 pb-16">

        {/* Header */}
        <div className="mb-8">
          <p className="text-xs text-[#C97552] uppercase tracking-widest mb-2">Community</p>
          <h1 className="font-serif italic text-3xl text-[#1A1A1A] mb-3">Trip Templates</h1>
          <p className="text-[#6b5f54] text-sm">
            Start from a proven itinerary — fully editable once copied to your trips.
          </p>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6" style={{ scrollbarWidth: 'none' }}>
          {CATEGORIES.map(cat => (
            <span
              key={cat}
              className="flex-shrink-0 text-xs capitalize px-3 py-1.5 rounded-full border border-[#E0D8CF] text-[#6b5f54] bg-white cursor-pointer hover:border-[#C97552] hover:text-[#C97552] transition-colors"
            >
              {cat}
            </span>
          ))}
        </div>

        {/* Templates grid */}
        {templates.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">🗺️</p>
            <p className="text-[#9A8E7E] text-sm">No templates yet.</p>
            <p className="text-[#B8B0A4] text-xs mt-1">Be the first — finish a trip and publish it as a template.</p>
            <Link href="/trips" className="inline-block mt-4 text-sm text-[#C97552] underline underline-offset-2">
              My trips →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {templates.map(t => (
              <div key={t.id} className="bg-white border border-[#E8E0D6] rounded-2xl overflow-hidden hover:border-[#C97552]/40 transition-colors group">
                {/* Gradient header based on destination */}
                <div className="h-20 bg-gradient-to-br from-[#C97552]/20 to-[#E8D5C4]/40 flex items-end px-4 pb-2">
                  <div>
                    <p className="text-[10px] text-[#9A8E7E] uppercase tracking-widest">
                      {t.destination_name}, {t.country}
                    </p>
                  </div>
                </div>

                <div className="p-4">
                  <h3 className="font-serif italic text-base text-[#1A1A1A] mb-1 group-hover:text-[#C97552] transition-colors">
                    {t.title}
                  </h3>
                  {t.description && (
                    <p className="text-xs text-[#6b5f54] line-clamp-2 mb-3">{t.description}</p>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex gap-3 text-[11px] text-[#9A8E7E]">
                      <span>{t.days} days</span>
                      <span>{t.copies} copies</span>
                    </div>
                    <div className="flex gap-1">
                      {(t.category ?? []).slice(0, 2).map(cat => (
                        <span key={cat} className="text-[10px] bg-[#F0EBE3] text-[#8A7E6E] px-2 py-0.5 rounded-full capitalize">
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>

                  <Link
                    href={`/plan?template=${t.id}`}
                    className="mt-3 block text-center text-xs font-medium text-[#C97552] border border-[#C97552]/30 rounded-full py-2 hover:bg-[#C97552] hover:text-white transition-colors"
                  >
                    Use template →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Publish CTA */}
        <div className="mt-12 p-6 rounded-2xl border border-[#E8E0D6] bg-white text-center space-y-3">
          <p className="font-serif italic text-lg text-[#1A1A1A]">Share your best trip</p>
          <p className="text-sm text-[#6b5f54]">Publish any of your trips as a community template — help others plan the same adventure.</p>
          <Link
            href="/trips"
            className="inline-block text-sm bg-[#C97552] text-white px-6 py-2.5 rounded-full hover:bg-[#b86644] transition-colors"
          >
            Go to My Trips →
          </Link>
        </div>
      </div>
    </div>
  )
}
