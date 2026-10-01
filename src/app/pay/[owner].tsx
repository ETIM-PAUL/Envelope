// Phase 14: the `envelope://pay/<owner>` deep-link destination — reached by scanning a Receive
// screen's QR with the phone's own camera app (no in-app scanner needed; the OS recognizes the
// URL and offers to open it) or by following a `https://<site>/tip/<owner>` tip link's app
// fallback. Validates the recipient, then hands off to the same amount/confirm screen Send uses —
// `showQuickAmounts` there is what the plan calls the "Tip screen" ($2/$5/$10/custom), not a
// separate screen, so it doesn't duplicate send-confirm's biometric-confirm/progress/relay logic.
import { isAddress } from '@solana/kit'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Text } from 'react-native'
import { Button } from '../../components/button'
import { Screen } from '../../components/screen'
import { SealMark } from '../../components/seal-mark'
import { fontFamily } from '../../design/tokens'
import { useConfidentialAccount } from '../../features/account/use-confidential-account'
import { useAppStore } from '../../store/app-store'
import { useWalletSession } from '../../features/wallet/use-wallet-session'
import { formatError } from '../../utils/format-error'

export default function Pay() {
  const router = useRouter()
  const { owner } = useLocalSearchParams<{ owner: string }>()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { isConnected, isBusy: connecting, connect } = useWalletSession()
  const { isRecipientReady } = useConfidentialAccount()
  const [error, setError] = useState<string | null>(null)
  const attempted = useRef(false)

  const validOwner = owner && isAddress(owner)
  const isSelf = validOwner && walletAddress === owner

  useEffect(() => {
    if (!isConnected || !validOwner || isSelf || attempted.current) return
    attempted.current = true
    isRecipientReady(owner)
      .then((ready) => {
        if (!ready) {
          setError("This address hasn't set up private transfers yet.")
          return
        }
        router.replace({ pathname: '/send-confirm', params: { recipient: owner, quickAmounts: '1' } })
      })
      .catch((e) => setError(formatError(e)))
    // Deliberately not re-running on every render — only when the inputs that decide the outcome
    // change (the `attempted` ref, not state, guards against duplicate calls).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, validOwner, isSelf, owner])

  if (!validOwner) {
    return (
      <Screen center>
        <Text className="text-paper-500 text-2xl mb-2 text-center" style={{ fontFamily: fontFamily.display }}>
          Invalid payment link
        </Text>
      </Screen>
    )
  }

  if (!isConnected) {
    return (
      <Screen center>
        <SealMark size={56} />
        <Text className="text-paper-500 text-2xl mt-6 mb-2 text-center" style={{ fontFamily: fontFamily.display }}>
          Connect to pay
        </Text>
        <Text className="text-mute-500 text-base mb-10 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
          Connect your wallet to send a private payment.
        </Text>
        <Button
          label={connecting ? 'Connecting…' : 'Connect wallet'}
          onPress={() => void connect()}
          busy={connecting}
        />
      </Screen>
    )
  }

  return (
    <Screen center>
      <Text className="text-mute-500 text-base text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
        {isSelf ? "That's your own payment link." : (error ?? 'Checking this address…')}
      </Text>
    </Screen>
  )
}
