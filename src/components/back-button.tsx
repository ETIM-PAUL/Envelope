// Subpath import — see src/app/(tabs)/_layout.tsx for why not the `@expo/vector-icons` barrel.
import Feather from '@expo/vector-icons/Feather'
import { useRouter } from 'expo-router'
import { Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../design/tokens'

// The root layout renders screens via <Slot/>, not <Stack/>, so pushed routes (onboarding,
// settings, withdraw) get no header or back chrome for free — without this, the only way back is
// an unlabeled system back-gesture/button, easy to miss. Absolutely positioned so it sits
// correctly whether the screen's content is centered or not.
export function BackButton() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={12}
      style={{ position: 'absolute', top: insets.top + 16, left: 20, zIndex: 50 }}
    >
      <Feather name="arrow-left" size={22} color={colors.paper[500]} />
    </Pressable>
  )
}
