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
  title: 'Voya — Find places most apps will never show you',
  description:
    'Three hidden gems a month, matched to your budget, your pace, your version of beautiful. Free, forever.',
  keywords: ['travel', 'hidden gems', 'destinations', 'travel discovery'],
  openGraph: {
    title: 'Voya — Travel Discovery',
    description: 'Find places most apps will never show you.',
    url: 'https://getvoya.net',
    siteName: 'Voya',
    type: 'website',
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
      </body>
    </html>
  )
}
