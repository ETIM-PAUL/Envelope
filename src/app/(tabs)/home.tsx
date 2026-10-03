// Subpath import — see src/app/(tabs)/_layout.tsx for why not the `@expo/vector-icons` barrel.
import Feather from '@expo/vector-icons/Feather'
import { Link } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { AppAddressLink } from '../../components/app-address-link'
import { BalanceSheen, DeltaStamp } from '../../components/balance-change-effects'
import { Screen } from '../../components/screen'
import { SealMark } from '../../components/seal-mark'
import { TierBadge } from '../../components/tier-badge'
import { colors, fontFamily } from '../../design/tokens'
import { useBalanceChange } from '../../features/account/use-balance-change'
import { usePrivateBalance } from '../../features/account/use-private-balance'
import { useTier } from '../../features/account/use-tier'
import { useConfidentialKeys } from '../../features/keys/use-confidential-keys'
import { useAppStore } from '../../store/app-store'
import { formatBaseUnits } from '../../utils/format-amount'

const CUSDC_DECIMALS = 6

export default function Home() {
  const walletAddress = useAppStore((s) => s.walletAddress)
  const tier = useAppStore((s) => s.tier)
  useTier(walletAddress)
  const { keysUnlocked } = useConfidentialKeys()
  const { availableBalance, pendingBalance, isLoading: balanceLoading } = usePrivateBalance()
  const { displayed, change } = useBalanceChange(keysUnlocked ? availableBalance : null)

  return (
    <Screen>
      <View className="flex-row justify-between items-center mb-5">
        <View className="flex-row items-center gap-2.5">
          <SealMark size={28} />
          <Text className="text-paper-500 text-xl" style={{ fontFamily: fontFamily.display }}>
            Envelope
          </Text>
        </View>
        <View className="flex-row items-center gap-3">
          <TierBadge tier={tier} />
          <Link href="/activity" asChild>
            <Pressable hitSlop={8}>
              <Feather name="clock" size={20} color={colors.mute[500]} />
            </Pressable>
          </Link>
          <Link href="/settings" asChild>
            <Pressable hitSlop={8}>
              <Feather name="settings" size={20} color={colors.mute[500]} />
            </Pressable>
          </Link>
        </View>
      </View>

      <View className="h-px bg-ink-800 mb-6" />

      {walletAddress ? (
        <View className="mb-6">
          <AppAddressLink address={walletAddress} label="Wallet" />
        </View>
      ) : null}

      <View className="bg-ink-900 border border-ink-800 rounded-3xl py-10 items-center overflow-hidden">
        <BalanceSheen change={change} />
        <Text className="text-mute-500 text-sm mb-2" style={{ fontFamily: fontFamily.ui }}>
          Private balance
        </Text>
        <Text className="text-paper-500" style={{ fontFamily: fontFamily.display, fontSize: 44, letterSpacing: -0.5 }}>
          {keysUnlocked && displayed !== null ? `$${formatBaseUnits(displayed, CUSDC_DECIMALS)}` : '— cUSDC'}
        </Text>
        <DeltaStamp change={change} decimals={CUSDC_DECIMALS} />
        <View className="flex-row items-center gap-1.5 mt-3">
          {keysUnlocked ? <View className="w-1.5 h-1.5 rounded-full bg-gold-500" /> : null}
          <Text className="text-mute-600 text-xs" style={{ fontFamily: fontFamily.ui }}>
            {!keysUnlocked
              ? 'Enable a private balance to see it here'
              : balanceLoading
                ? 'Decrypting…'
                : 'Sealed — only visible on this device'}
          </Text>
        </View>
        {keysUnlocked && pendingBalance !== null && pendingBalance > 0n ? (
          <Text className="text-gold-500 text-xs mt-2" style={{ fontFamily: fontFamily.ui }}>
            +${formatBaseUnits(pendingBalance, CUSDC_DECIMALS)} pending
          </Text>
        ) : null}
      </View>

      {keysUnlocked ? (
        <Link href="/add-funds" asChild>
          <Pressable className="bg-seal-500 rounded-2xl py-4 items-center mt-6 active:bg-seal-600">
            <Text className="text-paper-500" style={{ fontFamily: fontFamily.uiSemibold, fontSize: 16 }}>
              Add to private balance
            </Text>
          </Pressable>
        </Link>
      ) : null}

      <View className="flex-row gap-3 mt-6">
        <Link href="/send" asChild>
          <Pressable className="flex-1 bg-ink-900 border border-ink-800 rounded-2xl py-4 items-center flex-row justify-center gap-2 active:bg-ink-800">
            <Feather name="arrow-up-right" size={17} color={colors.paper[500]} />
            <Text className="text-paper-500" style={{ fontFamily: fontFamily.uiSemibold, fontSize: 15 }}>
              Send
            </Text>
          </Pressable>
        </Link>
        <Link href="/receive" asChild>
          <Pressable className="flex-1 bg-ink-900 border border-ink-800 rounded-2xl py-4 items-center flex-row justify-center gap-2 active:bg-ink-800">
            <Feather name="arrow-down-left" size={17} color={colors.paper[500]} />
            <Text className="text-paper-500" style={{ fontFamily: fontFamily.uiSemibold, fontSize: 15 }}>
              Receive
            </Text>
          </Pressable>
        </Link>
      </View>

      {keysUnlocked ? null : (
        <Link href="/onboarding" asChild>
          <Pressable className="bg-seal-500 rounded-2xl py-4 items-center mt-4 active:bg-seal-600">
            <Text className="text-paper-500" style={{ fontFamily: fontFamily.uiSemibold, fontSize: 16 }}>
              Enable private balance
            </Text>
          </Pressable>
        </Link>
      )}

      <Link href="/withdraw" asChild>
        <Pressable className="mt-4 items-center">
          <Text className="text-mute-500" style={{ fontFamily: fontFamily.uiSemibold, fontSize: 14 }}>
            Withdraw to USDC
          </Text>
        </Pressable>
      </Link>
    </Screen>
  )
}
