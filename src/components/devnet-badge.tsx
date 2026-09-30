import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fontFamily } from '../design/tokens'

// This build only ever talks to devnet (see src/config/rpc.ts, config/devnet.json) — a permanent
// reminder, not a network switcher. Mounted once at the app root so it survives navigation.
export function DevnetBadge() {
  const insets = useSafeAreaInsets()
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 10, right: 14, zIndex: 50 }}>
      <View className="flex-row items-center gap-1.5 bg-ink-900 border border-ink-800 px-2.5 py-1 rounded-full">
        <View className="w-1.5 h-1.5 rounded-full bg-gold-500" />
        <Text className="text-mute-500 text-xs" style={{ fontFamily: fontFamily.uiSemibold }}>
          Devnet
        </Text>
      </View>
    </View>
  )
}
