import { Suspense } from 'react'
import AppNav from '@/components/AppNav'

// AppNav uses useSearchParams which requires a Suspense boundary in layouts.
function NavWithSuspense() {
  return (
    <Suspense fallback={null}>
      <AppNav />
    </Suspense>
  )
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavWithSuspense />
      {/* pb-20 gives content breathing room above the fixed mobile bottom nav.
          md:pb-0 removes it on desktop where the nav is sticky top, not fixed bottom. */}
      <div className="pb-20 md:pb-0">
        {children}
      </div>
    </>
  )
}
