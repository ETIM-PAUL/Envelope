// Phase 15: "my pots" — a host's own locally-tracked list (there's no on-chain index to query
// instead, see pot-store.ts) plus a way to start a new one.
import Feather from '@expo/vector-icons/Feather'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Button } from '../../components/button'
import { Screen } from '../../components/screen'
import { colors, fontFamily } from '../../design/tokens'
import { useAppStore } from '../../store/app-store'
import { listPotSummaries, type PotSummary } from '../../features/pots/pot-store'

export default function Pots() {
  const router = useRouter()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const [pots, setPots] = useState<PotSummary[]>([])

  useFocusEffect(
    useCallback(() => {
      if (!walletAddress) return
      void listPotSummaries(walletAddress).then(setPots)
    }, [walletAddress]),
  )

  return (
    <Screen>
      <View className="flex-row justify-between items-center mb-6">
        <Text className="text-paper-500 text-2xl" style={{ fontFamily: fontFamily.display }}>
          Pots
        </Text>
        <Pressable onPress={() => router.push('/create-pot')} hitSlop={8}>
          <Feather name="plus-circle" size={24} color={colors.seal[500]} />
        </Pressable>
      </View>

      {pots.length === 0 ? (
        <View className="items-center mt-16">
          <View className="w-16 h-16 rounded-full bg-ink-900 border border-ink-800 items-center justify-center mb-5">
            <Feather name="archive" size={26} color={colors.mute[500]} />
          </View>
          <Text className="text-paper-500 text-xl mb-2 text-center" style={{ fontFamily: fontFamily.display }}>
            No pots yet
          </Text>
          <Text className="text-mute-500 text-base mb-8 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
            Start a sealed group gift — only you see who gave what.
          </Text>
          <View className="w-full max-w-xs">
            <Button label="Create a pot" onPress={() => router.push('/create-pot')} />
          </View>
        </View>
      ) : (
        <View className="gap-3">
          {pots.map((pot) => (
            <Pressable
              key={pot.potId}
              onPress={() => router.push({ pathname: '/pot/[potPda]', params: { potPda: pot.potPda } })}
              className="bg-ink-900 border border-ink-800 rounded-2xl p-5 active:bg-ink-800"
            >
              <Text className="text-paper-500 text-lg mb-1" style={{ fontFamily: fontFamily.display }}>
                {pot.name}
              </Text>
              <Text className="text-mute-500 text-sm" style={{ fontFamily: fontFamily.ui }}>
                Closes {new Date(Number(pot.closeTs) * 1000).toLocaleDateString()}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  )
}
