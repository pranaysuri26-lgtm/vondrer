import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Vondrer Pro — Unlock everything' }

const FEATURES = [
  { icon: '🤖', title: 'AI Chat assistant',          desc: 'Ask anything about your trip — logistics, swaps, packing.' },
  { icon: '🔄', title: 'Smart re-planning',           desc: 'Regenerate any day instantly when plans change.' },
  { icon: '📷', title: 'Unlimited photo cards',       desc: 'High-res photos on every activity card.' },
  { icon: '👥', title: 'Real-time collaboration',     desc: 'Invite friends to view & edit trips together.' },
  { icon: '📊', title: 'Budget tracker',              desc: 'Track planned vs actual spend per day and category.' },
  { icon: '🛂', title: 'Visa intelligence',           desc: 'Instant visa requirements for your passport + destination.' },
  { icon: '📱', title: 'Offline trip access',         desc: 'Full itinerary available without wifi — day-of ready.' },
  { icon: '📋', title: 'Trip templates',              desc: 'Save and share your trips as reusable community templates.' },
  { icon: '🌐', title: 'White-label API access',      desc: 'Embed Vondrer itinerary generation in your own product.' },
  { icon: '🔴', title: 'Live trip mode',              desc: 'Real-time day view, GPS check-ins, activity streaks.' },
]

const PLANS = [
  {
    name:      'Free',
    price:     '$0',
    period:    'forever',
    sub:       null,
    highlight: false,
    badge:     null,
    included: [
      '5 trips total',
      'AI itinerary generation',
      'Shareable trip links',
      'Map view',
      'Basic inline editing',
    ],
    excluded: [
      'AI Chat assistant',
      'Smart re-planning',
      'Budget tracker',
      'Visa intelligence',
      'Real-time collab',
      'Offline access',
      'Live trip mode',
      'API access',
    ],
    cta:      'Current plan',
    ctaHref:  '/trips',
    ctaStyle: 'border border-[#E0D8CF] text-[#6b5f54]',
  },
  {
    name:      'Pro',
    price:     '$4.99',
    period:    '/month',
    sub:       'billed monthly',
    highlight: true,
    badge:     'Most popular',
    included: [
      'Unlimited trips',
      'Everything in Free',
      'AI Chat assistant',
      'Smart re-planning',
      'Budget tracker',
      'Visa intelligence',
      'Real-time collaboration',
      'Offline trip access',
      'Live trip mode',
      'Trip templates',
    ],
    excluded: [],
    cta:      'Upgrade to Pro',
    ctaHref:  '/pro/checkout',
    ctaStyle: 'bg-[#C97552] text-white hover:bg-[#b86644]',
  },
  {
    name:      'Annual',
    price:     '$29',
    period:    '/year',
    sub:       '≈ $2.42 / month',
    highlight: false,
    badge:     'Save 52%',
    included: [
      'Everything in Pro',
      'White-label API access',
      'Priority support',
      'Early access to new features',
    ],
    excluded: [],
    cta:      'Get Annual',
    ctaHref:  '/pro/checkout?plan=annual',
    ctaStyle: 'bg-[#1A1A1A] text-white hover:bg-[#333]',
  },
]

export default function ProPage() {
  return (
    <div className="min-h-screen bg-[#FAF8F5]">

      {/* Hero */}
      <div className="max-w-3xl mx-auto px-4 pt-16 pb-12 text-center">
        <p className="text-xs text-[#C97552] uppercase tracking-widest mb-3">Vondrer Pro</p>
        <h1 className="font-serif italic text-4xl sm:text-5xl text-[#1A1A1A] leading-tight mb-4">
          Plan smarter.<br />Travel better.
        </h1>
        <p className="text-[#6b5f54] text-lg max-w-xl mx-auto">
          Unlock AI chat, smart re-planning, collaboration, live trip mode, and everything else Vondrer has to offer.
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
              {plan.badge && (
                <span className={`absolute -top-3 left-1/2 -translate-x-1/2 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                  plan.highlight ? 'bg-[#C97552]' : 'bg-emerald-500'
                }`}>
                  {plan.badge}
                </span>
              )}

              <p className="text-xs text-[#9A8E7E] uppercase tracking-widest mb-2">{plan.name}</p>
              <div className="flex items-end gap-1">
                <span className="text-3xl font-bold text-[#1A1A1A]">{plan.price}</span>
                <span className="text-sm text-[#9A8E7E] mb-1">{plan.period}</span>
              </div>
              {plan.sub && (
                <p className="text-[11px] text-[#B8B0A4] mt-0.5 mb-4">{plan.sub}</p>
              )}
              {!plan.sub && <div className="mb-4" />}

              <ul className="space-y-1.5 mb-6 flex-1">
                {plan.included.map(f => (
                  <li key={f} className="flex items-start gap-2 text-xs text-[#5A504A]">
                    <span className="text-emerald-500 mt-0.5 flex-shrink-0">✓</span>
                    {f}
                  </li>
                ))}
                {plan.excluded.slice(0, 3).map(f => (
                  <li key={f} className="flex items-start gap-2 text-xs text-[#C0B8B0] line-through">
                    <span className="mt-0.5 flex-shrink-0">✗</span>
                    {f}
                  </li>
                ))}
                {plan.excluded.length > 3 && (
                  <li className="text-xs text-[#C0B8B0]">+ {plan.excluded.length - 3} more locked</li>
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
