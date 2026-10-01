// Phase 14: shows this wallet's own `envelope://pay/<owner>` QR code (scannable by any phone's
// native camera — no in-app scanner needed, see src/app/pay/[owner].tsx) plus a shareable
// `https://<site>/tip/<owner>` link for anyone without the app yet.
import Feather from '@expo/vector-icons/Feather'
import QRCode from 'react-native-qrcode-svg'
import { Pressable, Share, Text, View } from 'react-native'
import { Screen } from '../../components/screen'
import { SealMark } from '../../components/seal-mark'
import { colors, fontFamily } from '../../design/tokens'
import { TIP_SITE_URL } from '../../config/site'
import { useAppStore } from '../../store/app-store'
import { useConfidentialKeys } from '../../features/keys/use-confidential-keys'

export default function Receive() {
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { keysUnlocked } = useConfidentialKeys()

  if (!walletAddress) return null

  const payLink = `envelope://pay/${walletAddress}`
  const tipLink = `${TIP_SITE_URL}/${walletAddress}`

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
