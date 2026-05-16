// Shared sun timing utilities — used by API routes and server components

export interface SunTimes {
  date:            string   // YYYY-MM-DD
  blue_am_start:   string   // HH:MM approx local
  blue_am_end:     string
  golden_am_start: string
  golden_am_end:   string
  golden_pm_start: string
  golden_pm_end:   string
  blue_pm_start:   string
  blue_pm_end:     string
}

/** Convert UTC ISO string to approximate local time using longitude offset */
export function utcToApproxLocal(utcIso: string, lngDeg: number): string {
  const offsetMin = Math.round(lngDeg / 15) * 60
  const d = new Date(new Date(utcIso).getTime() + offsetMin * 60_000)
  return d.toISOString().substring(11, 16) // "HH:MM"
}

/** Add or subtract minutes from an HH:MM string */
export function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total  = h * 60 + m + mins
  const hh     = Math.floor(((total % 1440) + 1440) % 1440 / 60)
  const mm     = ((total % 60) + 60) % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** Geocode a location string via Nominatim */
export async function geocodeLocation(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'Voya-App/1.0 (getvoya.net)' }, next: { revalidate: 86400 } }
    )
    const data = await r.json() as Array<{ lat: string; lon: string }>
    if (!data.length) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch { return null }
}

/** Fetch real golden/blue hour times for a lat/lng on a given date (defaults to today) */
export async function fetchSunTimes(lat: number, lng: number, date?: string): Promise<SunTimes | null> {
  try {
    const d    = date ?? new Date().toISOString().split('T')[0]
    const r    = await fetch(
      `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&formatted=0&date=${d}`,
      { headers: { 'User-Agent': 'Voya-App/1.0' }, next: { revalidate: 3600 } }
    )
    const data = await r.json() as {
      status: string
      results: { sunrise: string; sunset: string; dawn: string; dusk: string }
    }
    if (data.status !== 'OK') return null

    const sunrise       = utcToApproxLocal(data.results.sunrise, lng)
    const sunset        = utcToApproxLocal(data.results.sunset,  lng)
    const dawn          = utcToApproxLocal(data.results.dawn,    lng)
    const dusk          = utcToApproxLocal(data.results.dusk,    lng)
    const goldenAmEnd   = addMinutes(sunrise, 60)
    const goldenPmStart = addMinutes(sunset, -60)

    return {
      date:            d,
      blue_am_start:   dawn,
      blue_am_end:     sunrise,
      golden_am_start: sunrise,
      golden_am_end:   goldenAmEnd,
      golden_pm_start: goldenPmStart,
      golden_pm_end:   sunset,
      blue_pm_start:   sunset,
      blue_pm_end:     dusk,
    }
  } catch { return null }
}

/** Fallback sun times when the API is unavailable */
export function fallbackSunTimes(date?: string): SunTimes {
  return {
    date:            date ?? new Date().toISOString().split('T')[0],
    blue_am_start:   '05:10', blue_am_end:     '05:40',
    golden_am_start: '05:40', golden_am_end:   '06:40',
    golden_pm_start: '17:20', golden_pm_end:   '18:20',
    blue_pm_start:   '18:20', blue_pm_end:     '18:50',
  }
}
