import type { ReactNode } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Shared page frame: dark ink background, safe-area-aware padding. `center` is for the few
// screens that are a single focal moment (the connect gate, onboarding); everything else is
// left-aligned content that scrolls or lists.
export function Screen({ children, center }: { children: ReactNode; center?: boolean }) {
  const insets = useSafeAreaInsets()
  return (
    <View
      className={`flex-1 bg-ink-950 px-6 ${center ? 'items-center justify-center' : ''}`}
      style={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }}
    >
      {children}
    </View>
  )
}
