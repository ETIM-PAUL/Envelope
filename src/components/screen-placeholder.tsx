import type { ComponentProps } from 'react'
// Subpath import — see src/app/(tabs)/_layout.tsx for why not the `@expo/vector-icons` barrel.
import Feather from '@expo/vector-icons/Feather'
import { Text, View } from 'react-native'
import { colors, fontFamily } from '../design/tokens'
import { BackButton } from './back-button'
import { Screen } from './screen'

// Every screen below still needs its real content built — this proves navigation lands on the
// right one, with an icon and title specific to that screen, rather than a literal blank page.
// `showBack` is for the pushed (non-tab) routes that use this, like withdraw.tsx — the tab
// screens (send/receive/pots/stake) don't need it, they're reached via the tab bar.
export function ScreenPlaceholder({
  icon,
  title,
  description,
  showBack,
}: {
  icon: ComponentProps<typeof Feather>['name']
  title: string
  description?: string
  showBack?: boolean
}) {
  return (
    <Screen center>
      {showBack ? <BackButton /> : null}
      <View className="w-16 h-16 rounded-full bg-ink-900 border border-ink-800 items-center justify-center mb-5">
        <Feather name={icon} size={26} color={colors.mute[500]} />
      </View>
      <Text className="text-paper-500 text-2xl mb-2 text-center" style={{ fontFamily: fontFamily.display }}>
        {title}
      </Text>
      {description ? (
        <Text className="text-mute-500 text-base text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
          {description}
        </Text>
      ) : null}
    </Screen>
  )
}
