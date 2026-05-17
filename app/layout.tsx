import type { Metadata } from 'next'
import { Cormorant_Garamond, Raleway, Josefin_Sans } from 'next/font/google'
import './globals.css'

const cormorant = Cormorant_Garamond({
  variable: '--font-cormorant',
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
})

const raleway = Raleway({
  variable: '--font-raleway',
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600'],
})

const josefin = Josefin_Sans({
  variable: '--font-josefin',
  subsets: ['latin'],
  weight: ['200', '300', '400'],
})

export const metadata: Metadata = {
  title: 'Voya — AI Travel Planner',
  description: 'Plan, edit, and share AI-generated trip itineraries. Real photos, time windows, and local insights.',
  keywords: ['travel', 'itinerary planner', 'AI travel', 'trip planning'],
  manifest: '/manifest.json',
  appleWebApp: {
    capable:        true,
    statusBarStyle: 'default',
    title:          'Voya',
  },
  openGraph: {
    title:       'Voya — AI Travel Planner',
    description: 'Plan and share beautiful trip itineraries with AI.',
    url:         'https://getvoya.net',
    siteName:    'Voya',
    type:        'website',
  },
  icons: {
    apple: '/icons/icon-192.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${raleway.variable} ${josefin.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#FAF8F5] text-[#1A1A1A]">
        {children}
        {/* PWA service worker registration */}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').catch(() => {})
            })
          }
        `}} />
      </body>
    </html>
  )
}
