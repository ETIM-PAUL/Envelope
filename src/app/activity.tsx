// Subpath import — see src/app/(tabs)/_layout.tsx for why not the `@expo/vector-icons` barrel.
import Feather from '@expo/vector-icons/Feather'
import { FlatList, Text, View } from 'react-native'
import { BackButton } from '../components/back-button'
import { Screen } from '../components/screen'
import { colors, fontFamily } from '../design/tokens'
import { useActivity } from '../features/account/use-activity'
import { formatAssetAmount } from '../config/assets'

function formatDate(blockTime: number | null): string {
  if (blockTime === null) return ''
  return new Date(blockTime * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function Activity() {
  const { entries, isLoading } = useActivity()

  return (
    <Screen>
      <BackButton />
      <Text className="text-paper-500 text-2xl mb-1 mt-10" style={{ fontFamily: fontFamily.display }}>
        Activity
      </Text>
      <Text className="text-mute-500 text-sm mb-6" style={{ fontFamily: fontFamily.ui }}>
        Decrypted on this device only.
      </Text>

      <FlatList
        data={entries}
        keyExtractor={(entry) => entry.signature}
        ListEmptyComponent={
          <Text className="text-mute-500 text-center mt-10" style={{ fontFamily: fontFamily.ui }}>
            {isLoading ? 'Decrypting…' : 'No private transfers yet'}
          </Text>
        }
        ItemSeparatorComponent={() => <View className="h-px bg-ink-800 my-3" />}
        renderItem={({ item }) => (
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-full bg-ink-900 border border-ink-800 items-center justify-center">
              <Feather
                name={item.direction === 'incoming' ? 'arrow-down-left' : 'arrow-up-right'}
                size={16}
                color={item.direction === 'incoming' ? colors.success : colors.paper[500]}
              />
            </View>
            <View className="flex-1">
              <Text className="text-paper-500 text-base" style={{ fontFamily: fontFamily.uiSemibold }}>
                {item.direction === 'incoming' ? 'Received' : 'Sent'}
              </Text>
              <Text className="text-mute-600 text-xs" style={{ fontFamily: fontFamily.ui }}>
                {formatDate(item.blockTime)}
              </Text>
            </View>
            <Text
              className="text-base"
              style={{
                fontFamily: fontFamily.uiSemibold,
                color: item.direction === 'incoming' ? colors.success : colors.paper[500],
              }}
            >
              {item.direction === 'incoming' ? '+' : '-'}
              {formatAssetAmount(BigInt(item.amount), item.asset ?? 'usdc')}
            </Text>
          </View>
        )}
      />
    </Screen>
  )
}
