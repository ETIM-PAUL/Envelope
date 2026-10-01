// Phase 15: the `envelope://pot/<potPda>` deep-link destination, reached by scanning a pot's
// share QR the same way pay/[owner].tsx's link works (the OS camera recognizes the URL, no
// in-app scanner needed) — and also how the host themselves reopens a pot they created. Smart
// route: the host sees the dashboard (total, contributors, close), anyone else sees the normal
// Send flow pre-filled with the pot's own address — contributing to a pot is just a confidential
// transfer to it, nothing pot-specific on the guest's side.
import Feather from '@expo/vector-icons/Feather'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Pressable, Share, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { BackButton } from '../../components/back-button'
import { Button } from '../../components/button'
import { Screen } from '../../components/screen'
import { colors, fontFamily } from '../../design/tokens'
import { TIP_SITE_URL } from '../../config/site'
import { useAppStore } from '../../store/app-store'
import { useConfidentialAccount } from '../../features/account/use-confidential-account'
import { useClosePot } from '../../features/pots/use-close-pot'
import { usePotAccount } from '../../features/pots/use-pot-account'
import { usePotBalance } from '../../features/pots/use-pot-balance'
import { usePotContributions } from '../../features/pots/use-pot-contributions'
import { usePotKeys } from '../../features/pots/use-pot-keys'
import { ellipsify } from '../../utils/ellipsify'
import { formatBaseUnits } from '../../utils/format-amount'
import { formatError } from '../../utils/format-error'
import { CUSDC_DECIMALS } from '../../utils/parse-amount'

export default function Pot() {
  const { potPda } = useLocalSearchParams<{ potPda: string }>()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { data: pot, isLoading: potLoading } = usePotAccount(potPda ?? null)
  const { isRecipientReady } = useConfidentialAccount()

  const isHost = pot && walletAddress === pot.host

  if (potLoading || pot === undefined) {
    return (
      <Screen center>
        <BackButton />
      </Screen>
    )
  }

  if (!pot) {
    return (
      <Screen center>
        <BackButton />
        <Text className="text-paper-500 text-2xl text-center" style={{ fontFamily: fontFamily.display }}>
          Pot not found
        </Text>
      </Screen>
    )
  }

  return isHost ? (
    <HostView
      potPda={potPda!}
      potOwner={pot.potOwner}
      name={pot.name}
      closed={pot.closed}
      potId={pot.potId.toString()}
    />
  ) : (
    <GuestView potOwner={pot.potOwner} closed={pot.closed} isRecipientReady={isRecipientReady} />
  )
}

function HostView({
  potPda,
  potOwner,
  name,
  closed,
  potId,
}: {
  potPda: string
  potOwner: string
  name: string
  closed: boolean
  potId: string
}) {
  const router = useRouter()
  const { ensurePotKeys } = usePotKeys()
  const [keysReady, setKeysReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true
    ensurePotKeys(potId)
      .then(() => setKeysReady(true))
      .catch((e) => setError(formatError(e)))
  }, [ensurePotKeys, potId])

  const { availableBalance, pendingBalance, isLoading: balanceLoading } = usePotBalance(keysReady ? potOwner : null)
  const { data: contributions } = usePotContributions(keysReady ? potOwner : null)
  const { closePot } = useClosePot()
  const [isClosing, setIsClosing] = useState(false)

  const potPayLink = `envelope://pot/${potPda}`
  const tipLink = `${TIP_SITE_URL}/${potOwner}`

  async function handleShare() {
    await Share.share({ message: `Contribute to "${name}" on Envelope: ${tipLink}`, url: tipLink })
  }

  async function handleClose() {
    if (isClosing) return
    setIsClosing(true)
    setError(null)
    try {
      await closePot(potOwner, potId)
      router.replace('/(tabs)/pots')
    } catch (e) {
      setError(formatError(e))
    } finally {
      setIsClosing(false)
    }
  }

  return (
    <Screen>
      <BackButton />
      <View className="mt-10 mb-6">
        <Text className="text-paper-500 text-2xl mb-1" style={{ fontFamily: fontFamily.display }}>
          {name}
        </Text>
        <Text className="text-mute-500 text-sm" style={{ fontFamily: fontFamily.ui }}>
          {closed ? 'Closed' : 'Open'}
        </Text>
      </View>

      <View className="bg-ink-900 border border-ink-800 rounded-3xl py-8 items-center mb-6">
        <Text className="text-mute-500 text-sm mb-2" style={{ fontFamily: fontFamily.ui }}>
          Total raised
        </Text>
        <Text style={{ fontFamily: fontFamily.display, fontSize: 40, color: colors.paper[500] }}>
          {balanceLoading || availableBalance === null ? '—' : `$${formatBaseUnits(availableBalance, CUSDC_DECIMALS)}`}
        </Text>
        {pendingBalance !== null && pendingBalance > 0n ? (
          <Text className="text-gold-500 text-xs mt-2" style={{ fontFamily: fontFamily.ui }}>
            +${formatBaseUnits(pendingBalance, CUSDC_DECIMALS)} pending
          </Text>
        ) : null}
      </View>

      <Text className="text-mute-500 text-sm mb-3" style={{ fontFamily: fontFamily.uiSemibold }}>
        Contributors
      </Text>
      <View className="gap-2 mb-6">
        {contributions && contributions.length > 0 ? (
          contributions.map((c) => (
            <View
              key={c.signature}
              className="flex-row justify-between items-center bg-ink-900 border border-ink-800 rounded-2xl px-4 py-3"
            >
              <Text className="text-paper-500 text-sm" style={{ fontFamily: fontFamily.ui }}>
                {ellipsify(c.contributor)}
              </Text>
              <Text className="text-paper-500 text-sm" style={{ fontFamily: fontFamily.uiSemibold }}>
                ${formatBaseUnits(BigInt(c.amount), CUSDC_DECIMALS)}
              </Text>
            </View>
          ))
        ) : (
          <Text className="text-mute-600 text-sm" style={{ fontFamily: fontFamily.ui }}>
            No contributions yet.
          </Text>
        )}
      </View>

      {!closed ? (
        <View className="bg-ink-900 border border-ink-800 rounded-3xl p-5 items-center mb-6">
          <QRCode value={potPayLink} size={160} color={colors.ink[950]} backgroundColor={colors.paper[500]} />
        </View>
      ) : null}

      <View className="gap-3">
        {!closed ? (
          <Pressable
            onPress={() => void handleShare()}
            className="flex-row items-center justify-center gap-2 bg-ink-900 border border-ink-800 rounded-2xl py-4 active:bg-ink-800"
          >
            <Feather name="share" size={16} color={colors.paper[500]} />
            <Text style={{ fontFamily: fontFamily.uiSemibold, color: colors.paper[500], fontSize: 16 }}>
              Share invite link
            </Text>
          </Pressable>
        ) : null}
        {!closed ? (
          <Button
            label={isClosing ? 'Closing…' : 'Close pot & collect'}
            onPress={() => void handleClose()}
            busy={isClosing}
          />
        ) : null}
      </View>
      {error ? (
        <Text className="text-seal-500 mt-4 text-center" style={{ fontFamily: fontFamily.ui }}>
          {error}
        </Text>
      ) : null}
    </Screen>
  )
}

function GuestView({
  potOwner,
  closed,
  isRecipientReady,
}: {
  potOwner: string
  closed: boolean
  isRecipientReady: (address: string) => Promise<boolean>
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const attempted = useRef(false)

  useEffect(() => {
    if (closed || attempted.current) return
    attempted.current = true
    setChecking(true)
    isRecipientReady(potOwner)
      .then((ready) => {
        if (!ready) {
          setError("This pot isn't ready to receive contributions yet.")
          return
        }
        router.replace({ pathname: '/send-confirm', params: { recipient: potOwner, quickAmounts: '1' } })
      })
      .catch((e) => setError(formatError(e)))
      .finally(() => setChecking(false))
  }, [closed, potOwner, isRecipientReady, router])

  return (
    <Screen center>
      <BackButton />
      <Text className="text-mute-500 text-base text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
        {closed ? 'This pot is closed.' : (error ?? (checking ? 'Checking this pot…' : ''))}
      </Text>
    </Screen>
  )
}
