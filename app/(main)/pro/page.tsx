import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Voya Pro — Unlock everything' }

const FEATURES = [
  { icon: '🤖', title: 'AI Chat assistant',          desc: 'Ask anything about your trip — logistics, swaps, packing.' },
  { icon: '🔄', title: 'Smart re-planning',           desc: 'Regenerate any day instantly when plans change.' },
  { icon: '📷', title: 'Unlimited photo cards',       desc: 'High-res photos on every activity card.' },
  { icon: '👥', title: 'Real-time collaboration',     desc: 'Invite friends to view & edit trips together.' },
  { icon: '📊', title: 'Budget tracker',              desc: 'Track planned vs actual spend per day and category.' },
  { icon: '🛂', title: 'Visa intelligence',           desc: 'Instant visa requirements for your passport + destination.' },
  { icon: '📱', title: 'Offline trip access',         desc: 'Full itinerary available without wifi — day-of ready.' },
  { icon: '📋', title: 'Trip templates',              desc: 'Save and share your trips as reusable community templates.' },
  { icon: '🌐', title: 'White-label API access',      desc: 'Embed Voya itinerary generation in your own product.' },
  { icon: '🔴', title: 'Live trip mode',              desc: 'Real-time day view, GPS check-ins, activity streaks.' },
]

const PLANS = [
  {
    name:      'Free',
    price:     '$0',
    period:    'forever',
    highlight: false,
    features:  ['5 trips', 'AI itinerary generation', 'Share links', 'Map view', 'Basic editing'],
    cta:       'Current plan',
    ctaHref:   '/trips',
    ctaStyle:  'border border-[#E0D8CF] text-[#6b5f54]',
  },
  {
    name:      'Pro',
    price:     '$9',
    period:    '/month',
    highlight: true,
    features:  ['Unlimited trips', 'Everything in Free', ...FEATURES.map(f => f.title)],
    cta:       'Upgrade to Pro',
    ctaHref:   '/pro/checkout',
    ctaStyle:  'bg-[#C97552] text-white hover:bg-[#b86644]',
  },
  {
    name:      'Annual',
    price:     '$79',
    period:    '/year',
    highlight: false,
    badge:     'Save 27%',
    features:  ['Everything in Pro', 'Priority support', 'Early access to new features'],
    cta:       'Get Annual',
    ctaHref:   '/pro/checkout?plan=annual',
    ctaStyle:  'bg-[#1A1A1A] text-white hover:bg-[#333]',
  },
]

export default function ProPage() {
  return (
    <div className="min-h-screen bg-[#FAF8F5]">

      {/* Hero */}
      <div className="max-w-3xl mx-auto px-4 pt-16 pb-12 text-center">
        <p className="text-xs text-[#C97552] uppercase tracking-widest mb-3">Voya Pro</p>
        <h1 className="font-serif italic text-4xl sm:text-5xl text-[#1A1A1A] leading-tight mb-4">
          Plan smarter.<br />Travel better.
        </h1>
        <p className="text-[#6b5f54] text-lg max-w-xl mx-auto">
          Unlock AI chat, smart re-planning, collaboration, live trip mode, and everything else Voya has to offer.
        </p>
      </div>

      {/* Feature grid */}
      <div className="max-w-3xl mx-auto px-4 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-16">
          {FEATURES.map(f => (
            <div key={f.title} className="flex gap-3 bg-white border border-[#E8E0D6] rounded-2xl p-4">
              <span className="text-2xl flex-shrink-0">{f.icon}</span>
              <div>
                <p className="text-sm font-semibold text-[#1A1A1A]">{f.title}</p>
                <p className="text-xs text-[#6b5f54] mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PLANS.map(plan => (
            <div
              key={plan.name}
              className={`relative bg-white rounded-2xl border p-6 flex flex-col ${
                plan.highlight ? 'border-[#C97552] shadow-lg shadow-[#C97552]/10' : 'border-[#E8E0D6]'
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#C97552] text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  Most popular
                </span>
              )}
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  {plan.badge}
                </span>
              )}

              <p className="text-xs text-[#9A8E7E] uppercase tracking-widest mb-2">{plan.name}</p>
              <div className="flex items-end gap-1 mb-4">
                <span className="text-3xl font-bold text-[#1A1A1A]">{plan.price}</span>
                <span className="text-sm text-[#9A8E7E] mb-1">{plan.period}</span>
              </div>

              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.slice(0, 6).map(f => (
                  <li key={f} className="flex items-start gap-2 text-xs text-[#5A504A]">
                    <span className="text-emerald-500 mt-0.5 flex-shrink-0">✓</span>
                    {f}
                  </li>
                ))}
                {plan.features.length > 6 && (
                  <li className="text-xs text-[#9A8E7E]">+ {plan.features.length - 6} more</li>
                )}
              </ul>

              <Link
                href={plan.ctaHref}
                className={`block text-center text-sm font-semibold py-2.5 rounded-full transition-colors ${plan.ctaStyle}`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-[#B8B0A4] mt-8">
          All paid plans include a 7-day free trial. Cancel anytime. Stripe-secured checkout.
        </p>
      </div>
    </div>
  )
}
