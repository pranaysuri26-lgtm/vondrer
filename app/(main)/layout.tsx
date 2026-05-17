import { Suspense } from 'react'
import AppNav from '@/components/AppNav'
import GlobalChatBar from '@/components/GlobalChatBar'
import { ChatProvider } from '@/context/ChatContext'

function NavWithSuspense() {
  return (
    <Suspense fallback={null}>
      <AppNav />
    </Suspense>
  )
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatProvider>
      <NavWithSuspense />
      {/* pb-28 gives content room above both the fixed bottom nav AND the chat bar on mobile */}
      <div className="pb-28 md:pb-4">
        {children}
      </div>
      <GlobalChatBar />
    </ChatProvider>
  )
}
