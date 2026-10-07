// Phase 14: shows this wallet's own `envelope://pay/<owner>` QR code (scannable by any phone's
// native camera — no in-app scanner needed, see src/app/pay/[owner].tsx) plus a shareable
// `https://<site>/tip/<owner>` link for anyone without the app yet. Both carry `?assets=` — the
// tokens you'll take — so the payer's app only offers those.
import Feather from '@expo/vector-icons/Feather'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import QRCode from 'react-native-qrcode-svg'
import { useState } from 'react'
import { Pressable, Share, Text, View } from 'react-native'
import { AssetChips } from '../../components/asset-picker'
import { Screen } from '../../components/screen'
import { SealMark } from '../../components/seal-mark'
import { colors, fontFamily } from '../../design/tokens'
import { TIP_SITE_URL } from '../../config/site'
import { availableAssetIds, type AssetId } from '../../config/assets'
import { useConfidentialAccount } from '../../features/account/use-confidential-account'
import { formatError } from '../../utils/format-error'
import { useAppStore } from '../../store/app-store'
import { useConfidentialKeys } from '../../features/keys/use-confidential-keys'

export default function Receive() {
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { keysUnlocked } = useConfidentialKeys()
  const { isRecipientReady, ensureAccountReady } = useConfidentialAccount()
  const queryClient = useQueryClient()
  const [chosen, setChosen] = useState<AssetId[] | null>(null)
  const [settingUp, setSettingUp] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The tokens this wallet can already receive privately: the default for what the code asks for.
  const readyQueryKey = ['receive-ready-assets', walletAddress]
  const { data: ready } = useQuery({
    queryKey: readyQueryKey,
    enabled: Boolean(walletAddress && keysUnlocked),
    queryFn: async () => {
      const ids = availableAssetIds()
      const results = await Promise.all(ids.map((id) => isRecipientReady(walletAddress!, id)))
      return ids.filter((_, i) => results[i])
    },
  })

  if (!walletAddress) return null

  const accepted = chosen ?? (ready && ready.length > 0 ? ready : ['usdc' as AssetId])
  const assetsQuery = `?assets=${accepted.join(',')}`
  const payLink = `envelope://pay/${walletAddress}${assetsQuery}`
  const tipLink = `${TIP_SITE_URL}/${walletAddress}${assetsQuery}`

  // Asking for a token means being able to receive it: set up its confidential account first
  // (one wallet approval) if this wallet has never held it privately.
  async function handleAcceptedChange(next: AssetId[]) {
    setError(null)
    const added = next.filter((id) => !(ready ?? []).includes(id))
    if (added.length > 0) {
      setSettingUp(true)
      try {
        for (const id of added) await ensureAccountReady(id)
        await queryClient.invalidateQueries({ queryKey: readyQueryKey })
      } catch (e) {
        setError(formatError(e))
        return
      } finally {
        setSettingUp(false)
      }
    }
    setChosen(next)
  }

  async function handleShare() {
    await Share.share({
      message: `Send me a private payment on Envelope: ${tipLink}`,
      url: tipLink,
    })
  }

  return (
    <Screen center>
      <SealMark size={40} />
      <Text className="text-paper-500 text-2xl mt-5 mb-2 text-center" style={{ fontFamily: fontFamily.display }}>
        Receive privately
      </Text>
      <Text className="text-mute-500 text-base mb-8 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
        {keysUnlocked
          ? 'Anyone who scans this sends straight to your sealed balance.'
          : 'Enable a private balance to receive — this still works for a public send.'}
      </Text>

      {keysUnlocked && availableAssetIds().length > 1 ? (
        <View className="w-full max-w-xs mb-4">
          <Text className="text-mute-500 text-sm mb-2 text-center" style={{ fontFamily: fontFamily.uiSemibold }}>
            {settingUp ? 'Setting up…' : 'Accept'}
          </Text>
          <AssetChips selected={accepted} onChange={(next) => void handleAcceptedChange(next)} />
          {error ? (
            <Text className="text-seal-500 text-sm mt-2 text-center" style={{ fontFamily: fontFamily.ui }}>
              {error}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View className="bg-ink-900 border border-ink-800 rounded-3xl p-6 items-center mb-6">
        <View className="bg-paper-500 rounded-2xl p-4">
          <QRCode value={payLink} size={200} color={colors.ink[950]} backgroundColor={colors.paper[500]} />
        </View>
      </View>

      <Pressable
        onPress={() => void handleShare()}
        className="flex-row items-center gap-2 bg-ink-900 border border-ink-800 rounded-2xl py-4 px-6 active:bg-ink-800"
      >
        <Feather name="share" size={16} color={colors.paper[500]} />
        <Text style={{ fontFamily: fontFamily.uiSemibold, color: colors.paper[500], fontSize: 16 }}>
          Share tip link
        </Text>
      </Pressable>
    </Screen>
  )
}
