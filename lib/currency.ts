// ─── Shared currency utilities ────────────────────────────────────────────────
// Used by: signup onboarding (budget labels) + discover page (card display)

export interface CurrencyInfo {
  symbol: string
  code:   string
  rate:   number   // approximate multiplier from USD — display only, never stored
}

const CURRENCY_MAP: Array<{ keywords: string[]; currency: CurrencyInfo }> = [
  { keywords: ['india'],                                                              currency: { symbol: '₹',   code: 'INR', rate: 83    } },
  { keywords: ['united kingdom', 'uk', 'britain', 'england', 'scotland', 'wales'],   currency: { symbol: '£',   code: 'GBP', rate: 0.79  } },
  { keywords: ['australia'],                                                           currency: { symbol: 'A$',  code: 'AUD', rate: 1.53  } },
  { keywords: ['canada'],                                                              currency: { symbol: 'C$',  code: 'CAD', rate: 1.36  } },
  { keywords: ['brazil'],                                                              currency: { symbol: 'R$',  code: 'BRL', rate: 4.97  } },
  { keywords: ['japan'],                                                               currency: { symbol: '¥',   code: 'JPY', rate: 149   } },
  { keywords: ['singapore'],                                                           currency: { symbol: 'S$',  code: 'SGD', rate: 1.34  } },
  { keywords: ['uae', 'emirates', 'dubai', 'abu dhabi'],                              currency: { symbol: 'AED', code: 'AED', rate: 3.67  } },
  { keywords: ['south africa'],                                                        currency: { symbol: 'R',   code: 'ZAR', rate: 18.6  } },
  { keywords: ['mexico'],                                                              currency: { symbol: 'MX$', code: 'MXN', rate: 17.2  } },
  { keywords: ['china'],                                                               currency: { symbol: '¥',   code: 'CNY', rate: 7.2   } },
  { keywords: ['new zealand'],                                                         currency: { symbol: 'NZ$', code: 'NZD', rate: 1.63  } },
  { keywords: ['switzerland'],                                                         currency: { symbol: 'CHF', code: 'CHF', rate: 0.9   } },
  { keywords: ['norway'],                                                              currency: { symbol: 'kr',  code: 'NOK', rate: 10.6  } },
  { keywords: ['sweden'],                                                              currency: { symbol: 'kr',  code: 'SEK', rate: 10.4  } },
  { keywords: ['denmark'],                                                             currency: { symbol: 'kr',  code: 'DKK', rate: 6.9   } },
  { keywords: ['thailand'],                                                            currency: { symbol: '฿',   code: 'THB', rate: 35    } },
  { keywords: ['indonesia', 'bali'],                                                   currency: { symbol: 'Rp',  code: 'IDR', rate: 15700 } },
  { keywords: ['philippines'],                                                         currency: { symbol: '₱',   code: 'PHP', rate: 56    } },
  { keywords: ['pakistan'],                                                            currency: { symbol: '₨',   code: 'PKR', rate: 278   } },
  { keywords: ['nigeria'],                                                             currency: { symbol: '₦',   code: 'NGN', rate: 1500  } },
  { keywords: ['kenya'],                                                               currency: { symbol: 'KSh', code: 'KES', rate: 130   } },
  { keywords: ['germany', 'france', 'spain', 'italy', 'portugal', 'netherlands',
               'belgium', 'austria', 'greece', 'finland', 'ireland', 'europe',
               'luxembourg', 'slovakia', 'slovenia', 'croatia', 'estonia',
               'latvia', 'lithuania', 'malta', 'cyprus'],                             currency: { symbol: '€',   code: 'EUR', rate: 0.92  } },
]

export const USD_CURRENCY: CurrencyInfo = { symbol: '$', code: 'USD', rate: 1 }

export function detectCurrency(country: string): CurrencyInfo {
  const c = (country ?? '').toLowerCase().trim()
  if (!c) return USD_CURRENCY
  for (const entry of CURRENCY_MAP) {
    if (entry.keywords.some(k => c.includes(k))) return entry.currency
  }
  return USD_CURRENCY
}

export function fmtAmount(usd: number, currency: CurrencyInfo): string {
  const raw = usd * currency.rate
  if (raw >= 10000) return `${currency.symbol}${Math.round(raw / 1000)}k`
  if (raw >= 1000)  return `${currency.symbol}${Math.round(raw / 100) * 100}`
  if (raw >= 100)   return `${currency.symbol}${Math.round(raw / 10) * 10}`
  return `${currency.symbol}${Math.round(raw)}`
}

/** Format a USD value for display in the user's local currency.
 *  If non-USD, appends the USD equivalent so the user understands. */
export function displayBudget(usdPerDay: number, currency: CurrencyInfo): string {
  if (currency.code === 'USD') return `$${usdPerDay}/day`
  return `${fmtAmount(usdPerDay, currency)}/day  ≈ $${usdPerDay} USD`
}

export function buildBudgetOptions(currency: CurrencyInfo) {
  const isUSD = currency.code === 'USD'

  const sub = (low: number, high: number | null) => {
    const local = high
      ? `${fmtAmount(low, currency)}–${fmtAmount(high, currency)}/day`
      : `${fmtAmount(low, currency)}+/day`
    if (isUSD) return local
    return `${local}  ≈ $${high ? `${low}–${high}` : `${low}+`} USD`
  }

  return [
    { value: 'under-20',  label: 'Shoestring',  flag: '🎒', sub: `Under ${fmtAmount(20, currency)}/day${isUSD ? '' : '  ≈ under $20 USD'}` },
    { value: '20-50',     label: 'Budget',       flag: '💰', sub: sub(20,  50)  },
    { value: '50-150',    label: 'Mid-range',    flag: '✈️', sub: sub(50,  150) },
    { value: '150-300',   label: 'Comfortable',  flag: '🏨', sub: sub(150, 300) },
    { value: '300+',      label: 'Luxury',       flag: '💎', sub: sub(300, null) },
  ]
}

/** Human-readable label for the AI prompt */
export const BUDGET_LABELS: Record<string, string> = {
  'under-20':  'under $20/day (shoestring)',
  '20-50':     '$20–50/day (budget)',
  '50-150':    '$50–150/day (mid-range)',
  '150-300':   '$150–300/day (comfortable)',
  '300+':      '$300+/day (luxury)',
}
