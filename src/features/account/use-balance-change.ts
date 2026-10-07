// Drives Home's balance-change moment: when the private balance the user last *saw* differs from
// the current one, the figure counts from old to new and the change is reported once (for the
// delta stamp and the light sweep). "Saw" matters: a deposit/withdraw refreshes the balance while
// its own screen is still on top, so changes that land while Home isn't focused are held until the
// user comes back to it — otherwise the whole effect would play unseen underneath.
//
// What was last seen lives outside the component, per wallet: deposit/withdraw/send return with
// router.replace, which mounts a *fresh* Home — a ref inside it would start out already holding
// the new balance, see no change, and skip the whole effect.
import * as Haptics from 'expo-haptics'
import { useIsFocused } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'react-native-reanimated'
import type { AssetId } from '../../config/assets'
import { useAppStore } from '../../store/app-store'

const COUNT_DURATION_MS = 1100

export type BalanceChange = { delta: bigint; id: number }

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

// Per-session memory only: after an app restart the first balance shown is just shown. Keyed by
// wallet and token, so switching Home between dollars and SKR shows the other balance as-is
// instead of "animating" from one token's figure to the other's.
const lastSeenByWallet = new Map<string, bigint>()

export function useBalanceChange(balance: bigint | null, asset: AssetId = 'usdc') {
  const isFocused = useIsFocused()
  const reduceMotion = useReducedMotion()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const wallet = walletAddress ? `${walletAddress}:${asset}` : null
  const [counting, setCounting] = useState<bigint | null>(null) // the in-progress count, if any
  const [change, setChange] = useState<BalanceChange | null>(null)
  const frame = useRef<number | null>(null)

  useEffect(() => {
    if (balance === null || !wallet) return
    const seen = lastSeenByWallet.get(wallet)
    // First value this session: just show it — nothing has "changed" from the user's view.
    if (seen === undefined) {
      lastSeenByWallet.set(wallet, balance)
      return
    }
    if (!isFocused || balance === seen) return

    const from = seen
    const delta = balance - from
    lastSeenByWallet.set(wallet, balance)
    void (delta > 0n
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light))

    const startedAt = Date.now()
    const tick = () => {
      const t = reduceMotion ? 1 : Math.min(1, (Date.now() - startedAt) / COUNT_DURATION_MS)
      // Interpolated in Number space (a bigint can't be scaled by a fraction); fine for any
      // realistic balance — base units stay far below 2^53.
      setCounting(t < 1 ? from + BigInt(Math.round(Number(delta) * easeOutCubic(t))) : null)
      frame.current = t < 1 ? requestAnimationFrame(tick) : null
    }
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      setChange({ delta, id: startedAt })
      tick()
    })
  }, [balance, wallet, isFocused, reduceMotion])

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    [],
  )

  // Until a pending change has started playing, keep showing what was last seen — otherwise a
  // freshly mounted Home would flash the new figure for a frame before counting up to it.
  const seen = wallet ? lastSeenByWallet.get(wallet) : undefined
  const displayed = counting ?? (seen !== undefined && balance !== null && balance !== seen ? seen : balance)

  return { displayed, change }
}
