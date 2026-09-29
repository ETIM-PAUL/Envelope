import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Phase 7: this build only ever talks to devnet (see src/config/rpc.ts, config/devnet.json) —
// this badge is a permanent reminder, not a network switcher. Mounted once at the app root so it
// survives navigation between screens.
export function DevnetBadge() {
  const insets = useSafeAreaInsets()
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 8, right: 12, zIndex: 50 }}>
      <View className="bg-seal-600 px-3 py-1 rounded-full">
        <Text className="text-paper-50 text-xs font-bold tracking-wide">DEVNET</Text>
      </View>
    </View>
  )
}
