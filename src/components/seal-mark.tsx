// Subpath import — see src/app/(tabs)/_layout.tsx for why not the `@expo/vector-icons` barrel.
import Feather from '@expo/vector-icons/Feather'
import { View } from 'react-native'
import { colors } from '../design/tokens'

// The literal mark behind "sealed" — a small wax-seal circle. Used sparingly and only where it
// means something: the wordmark, the unlocked-balance indicator, onboarding's key moment. Never
// decorative filler.
export function SealMark({ size = 40 }: { size?: number }) {
  return (
    <View
      className="items-center justify-center"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.seal[500] }}
    >
      <Feather name="lock" size={Math.round(size * 0.42)} color={colors.paper[500]} />
    </View>
  )
}
