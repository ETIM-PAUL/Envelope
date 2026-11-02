// Share a statement: selective disclosure. Pick a token, then what to reveal: its balance, chosen
// transfers, or both. The phone proves each figure against Solana (features/statements) and the
// result is a link anyone can check on the verify page. Nothing else is revealed and no key
// leaves the phone, so there's nothing to revoke afterwards.
import Feather from '@expo/vector-icons/Feather'
import type { Statement } from '@envelope/cbridge'
import * as Clipboard from 'expo-clipboard'
import * as LocalAuthentication from 'expo-local-authentication'
import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, Share, Switch, Text, View } from 'react-native'
import { AssetToggle } from '../components/asset-picker'
import { BackButton } from '../components/back-button'
import { Button } from '../components/button'
import { Screen } from '../components/screen'
import { formatAssetAmount, type AssetId } from '../config/assets'
import { colors, fontFamily } from '../design/tokens'
import { activityEntryKey } from '../features/account/activity-cache'
import { useActivity } from '../features/account/use-activity'
import { usePrivateBalance } from '../features/account/use-private-balance'
import { useCreateStatement } from '../features/statements/use-create-statement'
import { useAppStore } from '../store/app-store'
import { formatError } from '../utils/format-error'

const MAX_TRANSFERS = 10

function formatDate(blockTime: number | null): string {
  if (blockTime === null) return ''
  return new Date(blockTime * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ShareStatement() {
  const router = useRouter()
  const preferredAsset = useAppStore((s) => s.selectedAsset)
  const [asset, setAsset] = useState<AssetId>(preferredAsset)
  const { availableBalance, pendingBalance } = usePrivateBalance(asset)
  const { entries, isLoading } = useActivity()
  const { createStatement, isBusy } = useCreateStatement()
  const [includeBalance, setIncludeBalance] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ statement: Statement; link: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const transfers = useMemo(
    () =>
      entries
        .filter((entry) => (entry.asset ?? 'usdc') === asset)
        .sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0)),
    [entries, asset],
  )
  const hasPending = (pendingBalance ?? 0n) > 0n
  const balanceChosen = includeBalance && !hasPending
  const chosen = transfers.filter((entry) => selected.has(activityEntryKey(entry)))
  const nothingChosen = !balanceChosen && chosen.length === 0

  function changeAsset(next: AssetId) {
    setAsset(next)
    setSelected(new Set())
    setError(null)
  }

  function toggle(key: string) {
    setError(null)
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else if (next.size < MAX_TRANSFERS) next.add(key)
      return next
    })
  }

  async function handleCreate() {
    if (isBusy || nothingChosen) return
    setError(null)
    const biometric = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Create a statement',
      cancelLabel: 'Cancel',
    })
    if (!biometric.success) {
      if (biometric.error !== 'user_cancel') setError("Couldn't confirm — try again.")
      return
    }
    try {
      setCreated(
        await createStatement(
          asset,
          balanceChosen,
          chosen.map((entry) => ({ signature: entry.signature, index: entry.index ?? 0 })),
        ),
      )
    } catch (e) {
      setError(formatError(e))
    }
  }

  if (created) {
    const count = created.statement.transfers?.length ?? 0
    return (
      <Screen scroll>
        <View className="items-center">
          <View className="w-14 h-14 rounded-full bg-ink-900 border border-ink-800 items-center justify-center mb-6">
            <Feather name="file-text" size={24} color={colors.gold[500]} />
          </View>
          <Text className="text-paper-500 text-2xl mb-2 text-center" style={{ fontFamily: fontFamily.display }}>
            Your statement is ready
          </Text>
          <Text className="text-mute-500 text-base mb-6 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
            Whoever opens the link can check these figures against Solana. It shows nothing else.
          </Text>
          <View className="w-full max-w-xs bg-ink-900 border border-ink-800 rounded-2xl px-4 py-3 mb-6 gap-1">
            {created.statement.balance ? (
              <Text className="text-paper-500 text-base" style={{ fontFamily: fontFamily.ui }}>
                Balance: {formatAssetAmount(BigInt(created.statement.balance.amount), asset)}
              </Text>
            ) : null}
            {count > 0 ? (
              <Text className="text-paper-500 text-base" style={{ fontFamily: fontFamily.ui }}>
                {count} {count === 1 ? 'transfer' : 'transfers'}
              </Text>
            ) : null}
          </View>
          <View className="w-full max-w-xs gap-3">
            <Button
              label="Share statement"
              onPress={() =>
                void Share.share({
                  message: `Here's a statement from my private Envelope balance. You can check it against Solana: ${created.link}`,
                })
              }
            />
            <Button
              label={copied ? 'Copied' : 'Copy link'}
              variant="secondary"
              onPress={() => {
                void Clipboard.setStringAsync(created.link)
                setCopied(true)
              }}
            />
          </View>
          <Text className="text-paper-400 text-sm mt-6 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
            Share it only with the person it&apos;s for: anyone with the link sees these figures.
          </Text>
          <View className="w-full max-w-xs mt-8">
            <Button label="Done" variant="secondary" onPress={() => router.back()} />
          </View>
        </View>
      </Screen>
    )
  }

  return (
    <Screen scroll>
      <BackButton />
      <Text className="text-paper-500 text-2xl mb-2 mt-10" style={{ fontFamily: fontFamily.display }}>
        Share a statement
      </Text>
      <Text className="text-mute-500 text-base mb-6" style={{ fontFamily: fontFamily.ui }}>
        Prove figures from your private balance to an accountant, a landlord or anyone you choose. They see only what
        you pick, and can check it against Solana. No key leaves your phone.
      </Text>

      {!isBusy ? (
        <View className="items-center mb-6">
          <AssetToggle value={asset} onChange={changeAsset} />
        </View>
      ) : null}

      <View className="bg-ink-900 border border-ink-800 rounded-2xl px-4 py-3 mb-6 flex-row items-center">
        <View className="flex-1">
          <Text className="text-paper-500 text-base" style={{ fontFamily: fontFamily.uiSemibold }}>
            Balance
          </Text>
          <Text className="text-mute-500 text-sm" style={{ fontFamily: fontFamily.ui }}>
            {hasPending
              ? 'Add your waiting funds to your balance first'
              : availableBalance !== null
                ? formatAssetAmount(availableBalance, asset)
                : 'Loading…'}
          </Text>
        </View>
        <Switch
          value={balanceChosen}
          onValueChange={setIncludeBalance}
          disabled={isBusy || hasPending}
          accessibilityLabel="Include my balance"
          trackColor={{ true: colors.seal[500], false: colors.ink[800] }}
          thumbColor={colors.paper[500]}
        />
      </View>

      <View className="flex-row items-baseline justify-between mb-3">
        <Text className="text-paper-500 text-lg" style={{ fontFamily: fontFamily.displayMedium }}>
          Transfers
        </Text>
        <Text className="text-mute-500 text-sm" style={{ fontFamily: fontFamily.ui }}>
          {chosen.length} of {MAX_TRANSFERS} at most
        </Text>
      </View>
      {transfers.length === 0 ? (
        <Text className="text-mute-500 mb-6" style={{ fontFamily: fontFamily.ui }}>
          {isLoading ? 'Decrypting your transfers…' : 'No private transfers in this token yet.'}
        </Text>
      ) : (
        <View className="gap-2 mb-6">
          {transfers.map((entry) => {
            const key = activityEntryKey(entry)
            const on = selected.has(key)
            const incoming = entry.direction === 'incoming'
            return (
              <Pressable
                key={key}
                onPress={() => toggle(key)}
                disabled={isBusy}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                className={`flex-row items-center rounded-2xl px-4 py-3 border ${on ? 'bg-ink-800 border-ink-700' : 'bg-ink-900 border-ink-800'}`}
              >
                <Feather
                  name={on ? 'check-square' : 'square'}
                  size={20}
                  color={on ? colors.gold[500] : colors.mute[500]}
                />
                <View className="flex-1 ml-3">
                  <Text className="text-paper-500 text-base" style={{ fontFamily: fontFamily.uiSemibold }}>
                    {incoming ? 'Received' : 'Sent'}
                  </Text>
                  <Text className="text-mute-600 text-xs" style={{ fontFamily: fontFamily.ui }}>
                    {formatDate(entry.blockTime)}
                  </Text>
                </View>
                <Text
                  className="text-base"
                  style={{ fontFamily: fontFamily.uiSemibold, color: incoming ? colors.success : colors.paper[500] }}
                >
                  {incoming ? '+' : '-'}
                  {formatAssetAmount(BigInt(entry.amount), asset)}
                </Text>
              </Pressable>
            )
          })}
        </View>
      )}

      <Button
        label={isBusy ? 'Proving on your phone…' : nothingChosen ? 'Choose what to include' : 'Create statement'}
        onPress={() => void handleCreate()}
        disabled={nothingChosen}
        busy={isBusy}
      />
      {error ? (
        <Text className="text-seal-500 mt-4 text-center" style={{ fontFamily: fontFamily.ui }}>
          {error}
        </Text>
      ) : null}
    </Screen>
  )
}
