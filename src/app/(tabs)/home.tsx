// Subpath import — see src/app/(tabs)/_layout.tsx for why not the `@expo/vector-icons` barrel.
import Feather from '@expo/vector-icons/Feather'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'expo-router'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { AppAddressLink } from '../../components/app-address-link'
import { AssetToggle } from '../../components/asset-picker'
import { BalanceSheen, DeltaStamp } from '../../components/balance-change-effects'
import { Screen } from '../../components/screen'
import { Button } from '../../components/button'
import { SealMark } from '../../components/seal-mark'
import { TierBadge } from '../../components/tier-badge'
import { colors, fontFamily } from '../../design/tokens'
import { useBalanceChange } from '../../features/account/use-balance-change'
import { useApplyPendingBalance } from '../../features/account/use-apply-pending-balance'
import { useConfidentialAccount } from '../../features/account/use-confidential-account'
import { usePrivateBalance } from '../../features/account/use-private-balance'
import { useTier } from '../../features/account/use-tier'
import { useConfidentialKeys } from '../../features/keys/use-confidential-keys'
import { ASSET_DECIMALS, formatAssetAmount, getAsset } from '../../config/assets'
import { useAppStore } from '../../store/app-store'
import { formatError } from '../../utils/format-error'

export default function Home() {
  const walletAddress = useAppStore((s) => s.walletAddress)
  const tier = useAppStore((s) => s.tier)
  const asset = useAppStore((s) => s.selectedAsset)
  const setAsset = useAppStore((s) => s.setSelectedAsset)
  const { symbol, privateSymbol } = getAsset(asset)
  useTier(walletAddress)
  const { keysUnlocked, enablePrivateBalance } = useConfidentialKeys()
  const { availableBalance, pendingBalance, isLoading: balanceLoading } = usePrivateBalance(asset)
  const { displayed, change } = useBalanceChange(keysUnlocked ? availableBalance : null, asset)

  // Wallets enabled before cSKR existed have only a private dollar account; nobody can send them
  // SKR until it's turned on (new wallets get both at onboarding).
  const { isRecipientReady, ensureAccountReady } = useConfidentialAccount()
  const queryClient = useQueryClient()
  const { data: assetReady } = useQuery({
    queryKey: ['own-asset-ready', walletAddress, asset],
    enabled: Boolean(walletAddress && keysUnlocked),
    queryFn: () => isRecipientReady(walletAddress!, asset),
  })
  const [turningOn, setTurningOn] = useState(false)
  const [turnOnError, setTurnOnError] = useState<string | null>(null)

  // Locked, but this wallet's private balance already exists on-chain: unlocking is one wallet
  // signature right here (phones that can't keep it behind the fingerprint ask on every open), not
  // the first-time setup screen.
  const { data: alreadySetUp } = useQuery({
    queryKey: ['own-account-exists', walletAddress],
    enabled: Boolean(walletAddress && !keysUnlocked),
    queryFn: () => isRecipientReady(walletAddress!, 'usdc'),
  })
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)

  async function handleUnlock() {
    if (unlocking) return
    setUnlocking(true)
    setUnlockError(null)
    try {
      await enablePrivateBalance()
    } catch (e) {
      setUnlockError(formatError(e))
    } finally {
      setUnlocking(false)
    }
  }

  // Incoming private payments and claimed gifts arrive as pending; adding them is the user's call
  // (one wallet signature, the gas tank pays).
  const { applyPendingBalance } = useApplyPendingBalance()
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  async function handleAddPending() {
    if (adding) return
    setAdding(true)
    setAddError(null)
    try {
      await applyPendingBalance(asset)
    } catch (e) {
      setAddError(formatError(e))
    } finally {
      setAdding(false)
    }
  }

  async function handleTurnOn() {
    if (turningOn) return
    setTurningOn(true)
    setTurnOnError(null)
    try {
      await ensureAccountReady(asset)
      await queryClient.invalidateQueries({ queryKey: ['own-asset-ready', walletAddress] })
      await queryClient.invalidateQueries({ queryKey: ['receive-ready-assets', walletAddress] })
    } catch (e) {
      setTurnOnError(formatError(e))
    } finally {
      setTurningOn(false)
    }
  }

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

      {keysUnlocked ? (
        <View className="mb-4">
          <AssetToggle value={asset} onChange={setAsset} />
        </View>
      ) : null}

      <View className="bg-ink-900 border border-ink-800 rounded-3xl py-10 items-center overflow-hidden">
        <BalanceSheen change={change} />
        <Text className="text-mute-500 text-sm mb-2" style={{ fontFamily: fontFamily.ui }}>
          Private balance
        </Text>
        <Text className="text-paper-500" style={{ fontFamily: fontFamily.display, fontSize: 44, letterSpacing: -0.5 }}>
          {!keysUnlocked ? 'Sealed' : displayed !== null ? formatAssetAmount(displayed, asset) : `— ${privateSymbol}`}
        </Text>
        <DeltaStamp change={change} decimals={ASSET_DECIMALS} asset={asset} />
        <View className="flex-row items-center gap-1.5 mt-3">
          {keysUnlocked ? <View className="w-1.5 h-1.5 rounded-full bg-gold-500" /> : null}
          <Text className="text-mute-600 text-xs" style={{ fontFamily: fontFamily.ui }}>
            {!keysUnlocked
              ? 'Your private dollars and SKR show here once unlocked'
              : balanceLoading
                ? 'Decrypting…'
                : 'Sealed — only visible on this device'}
          </Text>
        </View>
        {keysUnlocked && pendingBalance !== null && pendingBalance > 0n ? (
          <Pressable
            onPress={() => void handleAddPending()}
            disabled={adding}
            className="flex-row items-center gap-2 mt-4 rounded-full border border-gold-500 px-4 py-2 active:bg-ink-800"
            accessibilityLabel={`Add ${formatAssetAmount(pendingBalance, asset)} to your balance`}
          >
            <Text className="text-gold-500 text-sm" style={{ fontFamily: fontFamily.uiSemibold }}>
              {adding ? 'Adding…' : `+${formatAssetAmount(pendingBalance, asset)} pending · Add to balance`}
            </Text>
          </Pressable>
        ) : null}
        {addError ? (
          <Text className="text-seal-500 text-xs mt-2 text-center px-6" style={{ fontFamily: fontFamily.ui }}>
            {addError}
          </Text>
        ) : null}
      </View>

      {keysUnlocked && assetReady === false ? (
        <View className="mt-6">
          <Text className="text-mute-500 text-sm mb-3 text-center" style={{ fontFamily: fontFamily.ui }}>
            Private {symbol} isn&apos;t on yet. Turn it on so people can send you {symbol} privately.
          </Text>
          <Button
            label={turningOn ? 'Turning on…' : `Turn on private ${symbol}`}
            variant="secondary"
            onPress={() => void handleTurnOn()}
            busy={turningOn}
          />
          {turnOnError ? (
            <Text className="text-seal-500 text-sm mt-2 text-center" style={{ fontFamily: fontFamily.ui }}>
              {turnOnError}
            </Text>
          ) : null}
        </View>
      ) : null}

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

      {keysUnlocked ? null : alreadySetUp ? (
        <View className="mt-4">
          <Button
            label={unlocking ? 'Approve in your wallet…' : 'Unlock private balance'}
            onPress={() => void handleUnlock()}
            busy={unlocking}
          />
          {unlockError ? (
            <Text className="text-seal-500 text-sm mt-2 text-center" style={{ fontFamily: fontFamily.ui }}>
              {unlockError}
            </Text>
          ) : null}
        </View>
      ) : (
        <Link href="/onboarding" asChild>
          <Pressable className="bg-seal-500 rounded-2xl py-4 items-center mt-4 active:bg-seal-600">
            <Text className="text-paper-500" style={{ fontFamily: fontFamily.uiSemibold, fontSize: 16 }}>
              Enable private balance
            </Text>
          </Pressable>
        </Link>
      )}

      {/* Withdrawing decrypts the balance, so it needs the keys unlocked. */}
      {keysUnlocked ? (
        <Link href="/withdraw" asChild>
          <Pressable className="mt-4 items-center">
            <Text className="text-mute-500" style={{ fontFamily: fontFamily.uiSemibold, fontSize: 14 }}>
              Withdraw to {symbol}
            </Text>
          </Pressable>
        </Link>
      ) : null}
    </Screen>
  )
}
