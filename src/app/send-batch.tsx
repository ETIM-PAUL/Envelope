// Batch send: Member sends to 2 people, Business to 4, in one token with one fingerprint and one
// wallet approval per 2 people (see useSendBatch). Each person receives privately and sees only
// their own amount. Free sends to one person at a time, so it sees what the plans offer instead.
// A scanned pot invite resolves to the pot's own address, so a pot can be one of the recipients.
import Feather from '@expo/vector-icons/Feather'
import { isAddress, type GetAccountInfoApi, type Rpc } from '@solana/kit'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import * as Clipboard from 'expo-clipboard'
import * as LocalAuthentication from 'expo-local-authentication'
import { openURL } from 'expo-linking'
import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { AssetToggle } from '../components/asset-picker'
import { BackButton } from '../components/back-button'
import { Button } from '../components/button'
import { QrScanner } from '../components/qr-scanner'
import { Screen } from '../components/screen'
import { ASSET_DECIMALS, formatAssetAmount } from '../config/assets'
import { colors, fontFamily } from '../design/tokens'
import { usePrivateBalance } from '../features/account/use-private-balance'
import { MAX_BATCH_RECIPIENTS, PartialBatchError, useSendBatch } from '../features/account/use-send-batch'
import type { SendStep } from '../features/account/use-send-privately'
import { useTier } from '../features/account/use-tier'
import { useNetwork } from '../features/network/use-network'
import { fetchPot } from '../features/pots/use-pot-account'
import { useStakeInfo } from '../features/stake/use-stake-info'
import { useAppStore } from '../store/app-store'
import { formatExactBaseUnits } from '../utils/format-amount'
import { formatError } from '../utils/format-error'
import type { ScannedCode } from '../utils/parse-scanned-code'
import { parseDollarsToBaseUnits } from '../utils/parse-amount'

type Row = { id: number; address: string; amount: string }

const STEP_LABEL: Record<SendStep, string> = {
  idle: '',
  'checking-recipient': 'Checking recipients…',
  'preparing-proofs': 'Preparing proofs…',
  relaying: 'Verifying & sending…',
  confirming: 'Confirming…',
  done: 'Done',
}

let nextRowId = 0
const newRow = (): Row => ({ id: nextRowId++, address: '', amount: '' })

export default function SendBatch() {
  const router = useRouter()
  const { client } = useMobileWallet()
  const { getExplorerUrl } = useNetwork()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const asset = useAppStore((s) => s.selectedAsset)
  const setAsset = useAppStore((s) => s.setSelectedAsset)
  const isDollars = asset === 'usdc'
  const { availableBalance } = usePrivateBalance(asset)
  const { data: tierInfo } = useTier(walletAddress)
  // The tier's cap, from the relayer (which enforces it too); Free's until the tier has loaded.
  const maxRecipients = Math.min(tierInfo?.perks.maxBatchRecipients ?? 2, MAX_BATCH_RECIPIENTS)
  const { data: stakeInfo } = useStakeInfo()
  const { sendBatch, step, approval, isBusy } = useSendBatch()

  const [rows, setRows] = useState<Row[]>(() => [newRow(), newRow()])
  const [scanningRow, setScanningRow] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signatures, setSignatures] = useState<string[] | null>(null)

  const updateRow = (id: number, patch: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))
    setError(null)
  }

  const parsed = rows.map((row) => {
    const address = row.address.trim()
    const amount = parseDollarsToBaseUnits(row.amount, ASSET_DECIMALS)
    const addressProblem = !address
      ? null
      : !isAddress(address)
        ? 'Not a valid address'
        : address === walletAddress
          ? "That's your own address"
          : null
    return { ...row, address, amountValue: amount, addressProblem }
  })
  const complete = parsed.filter((r) => r.address && !r.addressProblem && r.amountValue)
  const allComplete = complete.length === parsed.length && parsed.length > 0
  const total = complete.reduce((sum, r) => sum + (r.amountValue ?? 0n), 0n)
  const overBalance = availableBalance !== null && total > availableBalance
  const feeEach = tierInfo?.tier === 'free' && tierInfo.freeTierFeeAmount ? BigInt(tierInfo.freeTierFeeAmount) : 0n
  const fee = feeEach * BigInt(parsed.length)
  const notEnoughSkrForFee = fee > 0n && stakeInfo !== undefined && stakeInfo.skrBalance < fee
  const shownTotal = formatAssetAmount(total, asset)
  const people = `${parsed.length} ${parsed.length === 1 ? 'person' : 'people'}`
  // Two transfers fit in a transaction, and each transaction is its own wallet approval.
  const approvals = Math.ceil(parsed.length / 2)

  async function handleScanned(code: ScannedCode) {
    const rowId = scanningRow
    setScanningRow(null)
    if (rowId === null) return
    if (code.kind === 'recipient') {
      updateRow(rowId, { address: code.address })
      return
    }
    if (code.kind === 'gift') {
      setError("That's a gift link, not an address — open it from the Send tab to claim it.")
      return
    }
    // A pot invite carries the pot's record address; transfers go to the pot's own address.
    try {
      const pot = await fetchPot(client.rpc as unknown as Rpc<GetAccountInfoApi>, code.potPda)
      if (!pot) throw new Error("We couldn't find that pot.")
      if (pot.closed) throw new Error('That pot is closed.')
      updateRow(rowId, { address: pot.potOwner })
    } catch (e) {
      setError(formatError(e))
    }
  }

  async function handleSend() {
    if (isBusy || !allComplete || overBalance || notEnoughSkrForFee) return
    setError(null)
    const biometricResult = await LocalAuthentication.authenticateAsync({
      promptMessage: `Confirm sending ${shownTotal} to ${people}`,
      cancelLabel: 'Cancel',
    })
    if (!biometricResult.success) {
      if (biometricResult.error !== 'user_cancel') setError("Couldn't confirm — try again.")
      return
    }
    try {
      setSignatures(
        await sendBatch(
          complete.map((r) => ({ address: r.address, amount: r.amountValue! })),
          asset,
        ),
      )
    } catch (e) {
      if (e instanceof PartialBatchError) {
        // The first `paid` rows went through; leave the rest ready to send again.
        setRows((current) => current.slice(e.paid))
        setError(e.message)
        return
      }
      setError(formatError(e))
    }
  }

  if (signatures) {
    return (
      <Screen center>
        <View className="w-16 h-16 rounded-full bg-ink-900 border border-ink-800 items-center justify-center mb-5">
          <Text style={{ fontSize: 28 }}>✓</Text>
        </View>
        <Text className="text-paper-500 text-2xl mb-2 text-center" style={{ fontFamily: fontFamily.display }}>
          Sent
        </Text>
        <Text className="text-mute-500 text-base mb-8 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
          {shownTotal} sent to {people}. Each of them sees only their own amount.
        </Text>
        <Pressable
          onPress={() => void openURL(getExplorerUrl(`tx/${signatures[signatures.length - 1]}`))}
          className="mb-6"
        >
          <Text className="text-mute-500 text-sm" style={{ fontFamily: fontFamily.uiSemibold }}>
            View on explorer
          </Text>
        </Pressable>
        <View className="w-full max-w-xs">
          <Button label="Done" onPress={() => router.replace('/(tabs)/home')} />
        </View>
      </Screen>
    )
  }

  if (tierInfo && maxRecipients < 2) {
    return (
      <Screen center>
        <BackButton />
        <Text className="text-paper-500 text-2xl mb-3 text-center" style={{ fontFamily: fontFamily.display }}>
          Send to several people
        </Text>
        <Text className="text-mute-500 text-base mb-8 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
          The Free plan sends to one person at a time. A Member pass sends to 2 people at once, and Business to 4, with
          no send fees.
        </Text>
        <View className="w-full max-w-xs">
          <Button label="See membership" onPress={() => router.push('/(tabs)/stake')} />
        </View>
      </Screen>
    )
  }

  return (
    <Screen scroll>
      <BackButton />
      <Text className="text-paper-500 text-2xl mt-10 mb-2" style={{ fontFamily: fontFamily.display }}>
        Send to several people
      </Text>
      <Text className="text-mute-500 text-base mb-5" style={{ fontFamily: fontFamily.ui }}>
        Each person sees only their own amount. One wallet approval for every 2 people.
      </Text>

      {isBusy ? null : (
        <View className="mb-4 items-start">
          <AssetToggle value={asset} onChange={setAsset} />
        </View>
      )}
      <Text className="text-mute-500 text-sm mb-4" style={{ fontFamily: fontFamily.ui }}>
        {availableBalance !== null ? `Available: ${formatAssetAmount(availableBalance, asset)}` : 'Loading balance…'}
      </Text>

      <View className="gap-3 mb-3">
        {parsed.map((row) => (
          <View key={row.id} className="bg-ink-900 border border-ink-800 rounded-2xl p-3">
            <View className="flex-row items-center">
              <TextInput
                value={row.address}
                onChangeText={(text) => updateRow(row.id, { address: text })}
                placeholder="Address"
                placeholderTextColor={colors.mute[600]}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isBusy}
                className="flex-1 text-paper-500 py-2"
                style={{ fontFamily: fontFamily.ui, fontSize: 14 }}
              />
              <Pressable
                onPress={() =>
                  void Clipboard.getStringAsync().then((text) => text && updateRow(row.id, { address: text.trim() }))
                }
                hitSlop={8}
                accessibilityLabel="Paste address"
                disabled={isBusy}
              >
                <Feather name="clipboard" size={16} color={colors.mute[500]} />
              </Pressable>
              <Pressable
                onPress={() => setScanningRow(row.id)}
                hitSlop={8}
                className="ml-4"
                accessibilityLabel="Scan QR code"
                disabled={isBusy}
              >
                <Feather name="maximize" size={16} color={colors.mute[500]} />
              </Pressable>
              {parsed.length > 1 ? (
                <Pressable
                  onPress={() => setRows((current) => current.filter((r) => r.id !== row.id))}
                  hitSlop={8}
                  className="ml-4"
                  accessibilityLabel="Remove recipient"
                  disabled={isBusy}
                >
                  <Feather name="x" size={16} color={colors.mute[500]} />
                </Pressable>
              ) : null}
            </View>
            <View className="h-px bg-ink-800 my-2" />
            <View className="flex-row items-center gap-1">
              {isDollars ? (
                <Text className="text-paper-500" style={{ fontFamily: fontFamily.uiSemibold, fontSize: 16 }}>
                  $
                </Text>
              ) : null}
              <TextInput
                value={row.amount}
                onChangeText={(text) => updateRow(row.id, { amount: text })}
                placeholder="0.00"
                placeholderTextColor={colors.mute[600]}
                keyboardType="decimal-pad"
                editable={!isBusy}
                className="flex-1 text-paper-500 py-1"
                style={{ fontFamily: fontFamily.uiSemibold, fontSize: 16 }}
              />
              {isDollars ? null : (
                <Text className="text-mute-500" style={{ fontFamily: fontFamily.uiSemibold, fontSize: 14 }}>
                  SKR
                </Text>
              )}
            </View>
            {row.addressProblem ? (
              <Text className="text-seal-500 text-xs mt-1" style={{ fontFamily: fontFamily.ui }}>
                {row.addressProblem}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      {parsed.length < maxRecipients && !isBusy ? (
        <Pressable
          onPress={() => setRows((current) => [...current, newRow()])}
          className="flex-row items-center justify-center gap-2 py-3 mb-5 rounded-2xl border border-dashed border-ink-700"
        >
          <Feather name="plus" size={16} color={colors.mute[500]} />
          <Text className="text-mute-500" style={{ fontFamily: fontFamily.uiSemibold, fontSize: 14 }}>
            Add recipient
          </Text>
        </Pressable>
      ) : !isBusy && tierInfo && maxRecipients < MAX_BATCH_RECIPIENTS ? (
        <Text className="text-mute-500 text-sm mb-5 text-center" style={{ fontFamily: fontFamily.ui }}>
          Your plan sends to {maxRecipients} people at once.{' '}
          <Link href="/(tabs)/stake" className="text-seal-400" style={{ fontFamily: fontFamily.uiSemibold }}>
            Business sends to {MAX_BATCH_RECIPIENTS}
          </Link>
        </Text>
      ) : (
        <View className="mb-5" />
      )}

      <View className="flex-row justify-between mb-1">
        <Text className="text-mute-500 text-sm" style={{ fontFamily: fontFamily.ui }}>
          Total
        </Text>
        <Text className="text-paper-500 text-sm" style={{ fontFamily: fontFamily.uiSemibold }}>
          {shownTotal}
        </Text>
      </View>
      <Text className="text-mute-600 text-xs mb-1" style={{ fontFamily: fontFamily.ui }}>
        {approvals === 1 ? 'One wallet approval' : `${approvals} wallet approvals, one for every 2 people`}
      </Text>
      <Text className="text-mute-600 text-xs mb-5" style={{ fontFamily: fontFamily.ui }}>
        {fee > 0n
          ? `Send fee: ${formatExactBaseUnits(fee, ASSET_DECIMALS)} SKR (${formatExactBaseUnits(feeEach, ASSET_DECIMALS)} each) · the relayer pays the SOL network fee`
          : 'No fee — your tier covers relayed sends'}
      </Text>
      {notEnoughSkrForFee ? (
        <Text className="text-paper-400 text-xs mb-5" style={{ fontFamily: fontFamily.ui }}>
          You need {formatExactBaseUnits(fee, ASSET_DECIMALS)} SKR in your wallet for these fees.{' '}
          <Link href="/(tabs)/stake" className="text-seal-400" style={{ fontFamily: fontFamily.uiSemibold }}>
            Get test SKR
          </Link>
        </Text>
      ) : null}

      <Button
        label={
          isBusy
            ? step === 'relaying' && approval && approval.total > 1
              ? `Approval ${approval.current} of ${approval.total}…`
              : STEP_LABEL[step]
            : overBalance
              ? 'Not enough balance'
              : notEnoughSkrForFee
                ? 'Not enough SKR for the fees'
                : allComplete
                  ? `Send ${shownTotal} to ${people}`
                  : 'Fill in every address and amount'
        }
        onPress={() => void handleSend()}
        disabled={!allComplete || overBalance || notEnoughSkrForFee}
        busy={isBusy}
      />
      {error ? (
        <Text className="text-seal-500 mt-4 text-center" style={{ fontFamily: fontFamily.ui }}>
          {error}
        </Text>
      ) : null}

      <QrScanner
        visible={scanningRow !== null}
        onScanned={(code) => void handleScanned(code)}
        onClose={() => setScanningRow(null)}
      />
    </Screen>
  )
}
