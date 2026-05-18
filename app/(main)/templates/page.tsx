import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import TemplateGallery from './TemplateGallery'

export const metadata: Metadata = { title: 'Trip Templates — Vondrer' }
export const revalidate = 3600   // re-fetch every hour

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
}

async function getTemplates(): Promise<Template[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data } = await supabase
    .from('trip_templates')
    .select('id, title, description, destination_name, country, days, category, copies, views')
    .eq('is_public', true)
    .order('copies', { ascending: false })
    .limit(60)
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
            Start from a proven itinerary — or combine multiple destinations into one trip.
          </p>
        </div>

        <TemplateGallery templates={templates} />

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
