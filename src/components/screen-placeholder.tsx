import { Text, View } from 'react-native'

// Phase 7: every screen below is still empty — this just proves navigation actually lands on the
// right one, with a distinct title per route, until each phase fills in its real content.
export function ScreenPlaceholder({ title, description }: { title: string; description?: string }) {
  return (
    <View className="flex-1 bg-paper-50 items-center justify-center px-8">
      <Text className="text-ink-900 text-2xl font-extrabold mb-2">{title}</Text>
      {description ? <Text className="text-ink-600 text-base text-center">{description}</Text> : null}
    </View>
  )
}
