// A gift's message from its sender, quoted: on the gift-link screen after sending, and on the
// claim screen. The text comes from a link, so it's only ever shown as plain text.
import { Text, View } from 'react-native'
import { fontFamily } from '../design/tokens'

export function GiftMessage({ message }: { message: string }) {
  return (
    <View className="w-full max-w-xs bg-ink-900 border border-ink-800 rounded-2xl px-4 py-3 mb-6">
      <Text className="text-paper-400 text-base text-center italic" style={{ fontFamily: fontFamily.ui }}>
        “{message}”
      </Text>
    </View>
  )
}
