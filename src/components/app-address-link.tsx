// Subpath import — see src/app/(tabs)/_layout.tsx for why not the `@expo/vector-icons` barrel.
import Feather from '@expo/vector-icons/Feather'
import * as Clipboard from 'expo-clipboard'
import { openURL } from 'expo-linking'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { colors, fontFamily } from '../design/tokens'
import { useNetwork } from '../features/network/use-network'
import { ellipsify } from '../utils/ellipsify'

// A labeled address with an explorer link and a copy button. Tapping the address also copies it.
export function AppAddressLink({ address, label }: { address: string; label: string }) {
  const { getExplorerUrl } = useNetwork()
  const [copied, setCopied] = useState(false)

  async function copy() {
    await Clipboard.setStringAsync(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <View className="flex-row items-center gap-2">
      <Pressable onPress={() => void copy()}>
        <Text className="text-mute-500 text-sm" style={{ fontFamily: fontFamily.ui }}>
          <Text style={{ fontFamily: fontFamily.uiSemibold }}>{label}</Text> {ellipsify(address)}
        </Text>
      </Pressable>
      <Pressable onPress={() => void openURL(getExplorerUrl(`address/${address}`))} hitSlop={8}>
        <Feather name="external-link" size={15} color={colors.mute[600]} />
      </Pressable>
      <Pressable onPress={() => void copy()} hitSlop={8}>
        <Feather name={copied ? 'check' : 'copy'} size={15} color={copied ? colors.success : colors.mute[600]} />
      </Pressable>
    </View>
  )
}
