// The visible half of Home's balance-change moment (timing lives in use-balance-change.ts):
// BalanceSheen — one band of warm reflected light glancing across the balance card, like light
// catching glass as you tilt it; DeltaStamp — the signed change, stamped in the card's corner like a
// postmark, then fading. Both key off the change's `id`, so each new change plays exactly once.
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import type { AssetId } from '../config/assets'
import { colors, fontFamily } from '../design/tokens'
import type { BalanceChange } from '../features/account/use-balance-change'
import { formatBaseUnits } from '../utils/format-amount'

const SWEEP_MS = 1150
const BAND_RATIO = 0.55 // band width as a share of the card's width

// Fills its (overflow-hidden, rounded) parent; renders nothing until a change arrives.
export function BalanceSheen({ change }: { change: BalanceChange | null }) {
  const reduceMotion = useReducedMotion()
  const [width, setWidth] = useState(0)
  const progress = useSharedValue(0)
  const band = width * BAND_RATIO

  useEffect(() => {
    if (!change || !width || reduceMotion) return
    progress.value = 0
    progress.value = withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.cubic) })
  }, [change, width, reduceMotion, progress])

  const sweep = useAnimatedStyle(() => ({
    // Starts fully off the left edge, ends fully off the right one.
    transform: [{ translateX: -band * 1.6 + progress.value * (width + band * 2.2) }, { rotate: '18deg' }],
    opacity: progress.value > 0 && progress.value < 1 ? 1 : 0,
  }))

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <Animated.View style={[{ position: 'absolute', top: -60, bottom: -60, width: band }, sweep]}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={colors.paper[500]} stopOpacity={0} />
                <Stop offset="0.45" stopColor={colors.paper[500]} stopOpacity={0.07} />
                <Stop offset="0.5" stopColor={colors.paper[500]} stopOpacity={0.16} />
                <Stop offset="0.55" stopColor={colors.paper[500]} stopOpacity={0.07} />
                <Stop offset="1" stopColor={colors.paper[500]} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#sheen)" />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  )
}

const STAMP_IN_MS = 260
const STAMP_HOLD_MS = 2600
const STAMP_OUT_MS = 450

export function DeltaStamp({
  change,
  decimals,
  asset = 'usdc',
}: {
  change: BalanceChange | null
  decimals: number
  asset?: AssetId
}) {
  const opacity = useSharedValue(0)
  const lift = useSharedValue(6)

  useEffect(() => {
    if (!change) return
    opacity.value = withSequence(
      withTiming(1, { duration: STAMP_IN_MS }),
      withDelay(STAMP_HOLD_MS, withTiming(0, { duration: STAMP_OUT_MS })),
    )
    lift.value = 6
    lift.value = withTiming(0, { duration: STAMP_IN_MS, easing: Easing.out(Easing.cubic) })
  }, [change, opacity, lift])

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: lift.value }] }))

  if (!change) return null
  const increase = change.delta > 0n
  const magnitude = increase ? change.delta : -change.delta
  const tint = increase ? colors.success : colors.paper[400]

  return (
    <Animated.View
      style={[
        {
          // Pinned like a postmark in the card's corner, so it never shifts the figure or text.
          position: 'absolute',
          top: 14,
          right: 14,
          paddingHorizontal: 10,
          paddingVertical: 3,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: tint,
        },
        style,
      ]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Private balance ${increase ? 'increased' : 'decreased'} by ${formatBaseUnits(magnitude, decimals)} ${asset === 'usdc' ? 'dollars' : 'SKR'}`}
    >
      <Text style={{ color: tint, fontFamily: fontFamily.uiSemibold, fontSize: 14, letterSpacing: 0.2 }}>
        {increase ? '+' : '−'}
        {asset === 'usdc' ? `$${formatBaseUnits(magnitude, decimals)}` : `${formatBaseUnits(magnitude, decimals)} SKR`}
      </Text>
    </Animated.View>
  )
}
