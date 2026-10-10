// Phase 13: recipient entry — the tab's entry point. Paste, type, or scan an address, check it's
// set up to receive privately, then hand off to /send-confirm (a pushed route, not a tab) for the
// amount + confirm step. A scanned pot invite fills in the pot's own address, so contributing to a
// pot is an ordinary send (see parse-scanned-code.ts); a gift link opens the claim screen.
import Feather from '@expo/vector-icons/Feather'
import { isAddress, type GetAccountInfoApi, type Rpc } from '@solana/kit'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import * as Clipboard from 'expo-clipboard'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { Button } from '../../components/button'
import { QrScanner } from '../../components/qr-scanner'
import { Screen } from '../../components/screen'
import { colors, fontFamily } from '../../design/tokens'
import { useConfidentialAccount } from '../../features/account/use-confidential-account'
import { availableAssetIds } from '../../config/assets'
import { fetchPot } from '../../features/pots/use-pot-account'
import { useAppStore } from '../../store/app-store'
import { formatError } from '../../utils/format-error'
import type { ScannedCode } from '../../utils/parse-scanned-code'

export default function Send() {
  const router = useRouter()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { isRecipientReady } = useConfidentialAccount()
  const { client } = useMobileWallet()
  const [addressText, setAddressText] = useState('')
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  // The scanned code's `?assets=` (the recipient's preference), kept while the address is unchanged.
  const [scannedAssets, setScannedAssets] = useState<{ address: string; assets: string } | null>(null)

  const trimmed = addressText.trim()
  const looksValid = trimmed.length > 0 && isAddress(trimmed)
  const isSelf = walletAddress !== null && trimmed === walletAddress

  async function handlePaste() {
    const clipboardText = await Clipboard.getStringAsync()
    if (clipboardText) setAddressText(clipboardText.trim())
  }

  async function handleScanned(code: ScannedCode) {
    setIsScanning(false)
    setError(null)
    if (code.kind === 'pot') {
      // The invite carries the pot's record address; the money goes to the pot's own address.
      try {
        const pot = await fetchPot(client.rpc as unknown as Rpc<GetAccountInfoApi>, code.potPda)
        if (!pot) throw new Error("We couldn't find that pot.")
        if (pot.closed) throw new Error('That pot is closed.')
        setAddressText(pot.potOwner)
        setScannedAssets(null)
      } catch (e) {
        setError(formatError(e))
      }
      return
    }
    if (code.kind === 'gift') {
      router.push({ pathname: '/gift', params: { k: code.secret } })
      return
    }
    setAddressText(code.address)
    setScannedAssets(code.assets ? { address: code.address, assets: code.assets } : null)
  }

  async function handleContinue() {
    if (isChecking || !looksValid || isSelf) return
    setIsChecking(true)
    setError(null)
    try {
      // Any token will do here; send-confirm offers exactly the ones this address can receive.
      const ready = await Promise.all(availableAssetIds().map((asset) => isRecipientReady(trimmed, asset)))
      if (!ready.some(Boolean)) {
        setError("This address hasn't set up private transfers yet.")
        return
      }
      const assets = scannedAssets?.address === trimmed ? scannedAssets.assets : undefined
      router.push({ pathname: '/send-confirm', params: { recipient: trimmed, ...(assets ? { assets } : {}) } })
    } catch (e) {
      setError(formatError(e))
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <Screen>
      <Text className="text-paper-500 text-2xl mb-2" style={{ fontFamily: fontFamily.display }}>
        Send privately
      </Text>
      <Text className="text-mute-500 text-base mb-8" style={{ fontFamily: fontFamily.ui }}>
        Only you and the recipient will ever know the amount.
      </Text>

      <Text className="text-mute-500 text-sm mb-2" style={{ fontFamily: fontFamily.uiSemibold }}>
        Recipient address
      </Text>
      <View className="flex-row items-center bg-ink-900 border border-ink-800 rounded-2xl px-4 mb-2">
        <TextInput
          value={addressText}
          onChangeText={(text) => {
            setAddressText(text)
            setError(null)
          }}
          placeholder="Paste, scan, or type an address"
          placeholderTextColor={colors.mute[600]}
          autoCapitalize="none"
          autoCorrect={false}
          className="flex-1 text-paper-500 py-4"
          style={{ fontFamily: fontFamily.ui, fontSize: 15 }}
        />
        <Pressable onPress={() => void handlePaste()} hitSlop={8} accessibilityLabel="Paste address">
          <Feather name="clipboard" size={18} color={colors.mute[500]} />
        </Pressable>
        <Pressable onPress={() => setIsScanning(true)} hitSlop={8} className="ml-4" accessibilityLabel="Scan QR code">
          <Feather name="maximize" size={18} color={colors.mute[500]} />
        </Pressable>
      </View>

      {isSelf ? (
        <Text className="text-mute-500 text-sm mb-4" style={{ fontFamily: fontFamily.ui }}>
          That&apos;s your own address.
        </Text>
      ) : null}
      {error ? (
        <Text className="text-seal-500 text-sm mb-4" style={{ fontFamily: fontFamily.ui }}>
          {error}
        </Text>
      ) : null}

      <View className="mt-4">
        <Button
          label={isChecking ? 'Checking…' : 'Continue'}
          onPress={() => void handleContinue()}
          disabled={!looksValid || isSelf}
          busy={isChecking}
        />
      </View>

      <Pressable onPress={() => router.push('/send-batch')} className="mt-5 flex-row items-center justify-center gap-2">
        <Feather name="users" size={15} color={colors.mute[500]} />
        <Text className="text-mute-500" style={{ fontFamily: fontFamily.uiSemibold, fontSize: 14 }}>
          Send to several people
        </Text>
      </Pressable>

      <Pressable onPress={() => router.push('/send-gift')} className="mt-4 flex-row items-center justify-center gap-2">
        <Feather name="gift" size={15} color={colors.mute[500]} />
        <Text className="text-mute-500" style={{ fontFamily: fontFamily.uiSemibold, fontSize: 14 }}>
          Send as a gift link
        </Text>
      </Pressable>

      <QrScanner
        visible={isScanning}
        onScanned={(code) => void handleScanned(code)}
        onClose={() => setIsScanning(false)}
      />
    </Screen>
  )
}
