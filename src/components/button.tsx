import { ActivityIndicator, Pressable, Text } from 'react-native'
import { colors, fontFamily } from '../design/tokens'

type Variant = 'primary' | 'secondary' | 'ghost'

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-seal-500 active:bg-seal-600',
  secondary: 'bg-ink-800 active:bg-ink-700',
  ghost: 'bg-transparent',
}

const VARIANT_TEXT_COLOR: Record<Variant, string> = {
  primary: colors.paper[500],
  secondary: colors.paper[500],
  ghost: colors.mute[500],
}

// One button primitive for the whole app — every screen used to hand-roll its own
// Pressable+Text combo with slightly different padding/opacity/active states.
export function Button({
  label,
  onPress,
  disabled,
  busy,
  variant = 'primary',
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  busy?: boolean
  variant?: Variant
}) {
  const isDisabled = Boolean(disabled || busy)
  const textColor = VARIANT_TEXT_COLOR[variant]

  return (
    <Pressable
      disabled={isDisabled}
      onPress={onPress}
      className={`rounded-2xl py-4 px-6 items-center justify-center flex-row gap-2 ${VARIANT_CLASS[variant]} ${isDisabled ? 'opacity-50' : ''}`}
    >
      {busy ? <ActivityIndicator color={textColor} /> : null}
      <Text style={{ fontFamily: fontFamily.uiSemibold, color: textColor, fontSize: 16 }}>{label}</Text>
    </Pressable>
  )
}
