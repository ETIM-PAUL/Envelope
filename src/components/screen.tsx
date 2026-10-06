import type { ReactNode } from 'react'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../design/tokens'
import { BADGE_STRIP_HEIGHT } from './devnet-badge'

// Shared page frame: dark ink background, safe-area-aware padding. `center` is for the few
// screens that are a single focal moment (the connect gate, onboarding); everything else is
// left-aligned content. `scroll` is for pages that can run taller than the phone (Stake's
// balance, actions, and perks table): content scrolls, and taps on inputs/buttons still land
// while the keyboard is up.
export function Screen({ children, center, scroll }: { children: ReactNode; center?: boolean; scroll?: boolean }) {
  const insets = useSafeAreaInsets()
  const padding = { paddingTop: insets.top + BADGE_STRIP_HEIGHT + 8, paddingBottom: insets.bottom + 20 }

  if (scroll) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.ink[950] }}
        contentContainerStyle={{ ...padding, paddingHorizontal: 24, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    )
  }

  return (
    <View className={`flex-1 bg-ink-950 px-6 ${center ? 'items-center justify-center' : ''}`} style={padding}>
      {children}
    </View>
  )
}
