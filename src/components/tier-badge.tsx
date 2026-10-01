import { Text, View } from 'react-native'
import { colors, fontFamily } from '../design/tokens'
import type { Tier } from '../store/app-store'

const TIER_LABEL: Record<Tier, string> = { free: 'Free', member: 'Member', business: 'Business' }
const TIER_COLOR: Record<Tier, string> = {
  free: colors.mute[500],
  member: colors.gold[500],
  business: colors.seal[500],
}

// The one place tier shows up as a glanceable badge rather than spelled-out copy — used sparingly
// (home header, stake screen), matching SealMark's "used sparingly and only where it means
// something" precedent rather than decorating every screen with it.
export function TierBadge({ tier }: { tier: Tier }) {
  const color = TIER_COLOR[tier]
  return (
    <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border" style={{ borderColor: color }}>
      <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      <Text style={{ fontFamily: fontFamily.uiSemibold, color, fontSize: 12 }}>{TIER_LABEL[tier]}</Text>
    </View>
  )
}
