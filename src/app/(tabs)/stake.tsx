// Phase 16: stake/unstake SKR, see the current tier and perks live. Reads/writes go straight to
// envelope_stake (use-stake-info.ts/use-stake-actions.ts) — no bridge, no secret material.
import * as Haptics from 'expo-haptics'
import { useEffect, useRef, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { Button } from '../../components/button'
import { Screen } from '../../components/screen'
import { TierBadge } from '../../components/tier-badge'
import { colors, fontFamily } from '../../design/tokens'
import { useStakeInfo } from '../../features/stake/use-stake-info'
import { useSkrFaucet } from '../../features/stake/use-skr-faucet'
import { useStakeActions } from '../../features/stake/use-stake-actions'
import { formatBaseUnits } from '../../utils/format-amount'
import { formatError } from '../../utils/format-error'
import type { Tier } from '../../store/app-store'

const SKR_DECIMALS = 6
const TIER_ORDER: Record<Tier, number> = { free: 0, member: 1, business: 2 }

function parseSkrToBaseUnits(input: string): bigint | null {
  if (!/^\d+(\.\d{1,6})?$/.test(input.trim())) return null
  const [whole, fraction = ''] = input.trim().split('.')
  const paddedFraction = fraction.padEnd(SKR_DECIMALS, '0')
  const baseUnits = BigInt(whole) * 10n ** BigInt(SKR_DECIMALS) + BigInt(paddedFraction)
  return baseUnits > 0n ? baseUnits : null
}

// Devnet only: test SKR from the relayer's faucet, so trying the tiers doesn't need a script.
function FaucetRow() {
  const { status, claim } = useSkrFaucet()
  if (!status) return null

  const available = BigInt(status.available)
  const nextClaimTime = status.nextClaimAt
    ? new Date(status.nextClaimAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : null
  const reason =
    available > 0n
      ? null
      : BigInt(status.held) >= BigInt(status.maxHeld)
        ? `You hold the ${formatBaseUnits(BigInt(status.maxHeld), SKR_DECIMALS).replace('.00', '')} test SKR maximum`
        : `Today's test SKR claimed — more after ${nextClaimTime}`

  return (
    <View className="items-center mt-5">
      {reason ? (
        <Text className="text-mute-600 text-xs" style={{ fontFamily: fontFamily.ui }}>
          {reason}
        </Text>
      ) : (
        <Pressable
          onPress={() => claim.mutate()}
          disabled={claim.isPending}
          accessibilityRole="button"
          className="flex-row items-center gap-2 border border-ink-700 rounded-full px-4 py-2 active:bg-ink-800"
        >
          <Text className="text-paper-400 text-sm" style={{ fontFamily: fontFamily.uiSemibold }}>
            {claim.isPending
              ? 'Sending…'
              : `Get ${formatBaseUnits(available, SKR_DECIMALS).replace('.00', '')} test SKR`}
          </Text>
        </Pressable>
      )}
      {claim.error ? (
        <Text className="text-seal-500 text-xs mt-2 text-center" style={{ fontFamily: fontFamily.ui }}>
          {formatError(claim.error)}
        </Text>
      ) : null}
    </View>
  )
}

function useCountdown(unlockAt: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!unlockAt) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [unlockAt])
  if (!unlockAt) return null
  return Math.max(0, Math.ceil((unlockAt - now) / 1000))
}

export default function Stake() {
  const { data: info, isLoading, refetch } = useStakeInfo()
  const { stake, requestUnstake, withdrawUnstaked } = useStakeActions()
  const [amountText, setAmountText] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previousTier = useRef<Tier | null>(null)

  useEffect(() => {
    if (!info) return
    if (previousTier.current && TIER_ORDER[info.tier] > TIER_ORDER[previousTier.current]) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    }
    previousTier.current = info.tier
  }, [info])

  const unlockAtMs =
    info && info.unlockRequestedAt > 0n ? Number(info.unlockRequestedAt + info.cooldownSecs) * 1000 : null
  const secondsRemaining = useCountdown(unlockAtMs)
  const cooldownElapsed = unlockAtMs !== null && secondsRemaining === 0

  const stakeAmount = parseSkrToBaseUnits(amountText)
  const overBalance = stakeAmount !== null && info !== undefined && stakeAmount > info.skrBalance

  async function handleStake() {
    if (isBusy || !stakeAmount || overBalance) return
    setIsBusy(true)
    setError(null)
    try {
      await stake(stakeAmount)
      setAmountText('')
      await refetch()
    } catch (e) {
      setError(formatError(e))
    } finally {
      setIsBusy(false)
    }
  }

  async function handleRequestUnstake() {
    if (isBusy) return
    setIsBusy(true)
    setError(null)
    try {
      await requestUnstake()
      await refetch()
    } catch (e) {
      setError(formatError(e))
    } finally {
      setIsBusy(false)
    }
  }

  async function handleWithdraw() {
    if (isBusy) return
    setIsBusy(true)
    setError(null)
    try {
      await withdrawUnstaked()
      await refetch()
    } catch (e) {
      setError(formatError(e))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <Screen>
      <View className="flex-row justify-between items-center mb-6">
        <Text className="text-paper-500 text-2xl" style={{ fontFamily: fontFamily.display }}>
          Stake
        </Text>
        {info ? <TierBadge tier={info.tier} /> : null}
      </View>

      <View className="bg-ink-900 border border-ink-800 rounded-3xl py-8 items-center mb-6">
        <Text className="text-mute-500 text-sm mb-2" style={{ fontFamily: fontFamily.ui }}>
          Staked SKR
        </Text>
        <Text style={{ fontFamily: fontFamily.display, fontSize: 40, color: colors.paper[500] }}>
          {isLoading || !info ? '—' : formatBaseUnits(info.stakedAmount, SKR_DECIMALS)}
        </Text>
        <Text className="text-mute-600 text-xs mt-2" style={{ fontFamily: fontFamily.ui }}>
          {info ? `${formatBaseUnits(info.skrBalance, SKR_DECIMALS)} SKR available to stake` : 'Loading…'}
        </Text>
        <FaucetRow />
      </View>

      {info && info.unlockRequestedAt === 0n ? (
        <View className="mb-6">
          <Text className="text-mute-500 text-sm mb-2" style={{ fontFamily: fontFamily.uiSemibold }}>
            Stake more SKR
          </Text>
          <View className="flex-row items-center bg-ink-900 border border-ink-800 rounded-2xl px-4 mb-3">
            <TextInput
              value={amountText}
              onChangeText={(text) => {
                setAmountText(text)
                setError(null)
              }}
              placeholder="0.00"
              placeholderTextColor={colors.mute[600]}
              keyboardType="decimal-pad"
              editable={!isBusy}
              className="flex-1 text-paper-500 py-4"
              style={{ fontFamily: fontFamily.ui, fontSize: 15 }}
            />
            <Text className="text-mute-500 text-sm" style={{ fontFamily: fontFamily.uiSemibold }}>
              SKR
            </Text>
          </View>
          <Button
            label={isBusy ? 'Staking…' : overBalance ? 'Not enough SKR' : 'Stake'}
            onPress={() => void handleStake()}
            disabled={!stakeAmount || overBalance}
            busy={isBusy}
          />
        </View>
      ) : null}

      {info && info.stakedAmount > 0n ? (
        <View className="mb-6">
          {info.unlockRequestedAt === 0n ? (
            <Button
              label={isBusy ? 'Requesting…' : 'Unstake'}
              variant="secondary"
              onPress={() => void handleRequestUnstake()}
              busy={isBusy}
            />
          ) : cooldownElapsed ? (
            <Button
              label={isBusy ? 'Withdrawing…' : 'Withdraw unstaked SKR'}
              onPress={() => void handleWithdraw()}
              busy={isBusy}
            />
          ) : (
            <View className="bg-ink-900 border border-ink-800 rounded-2xl py-4 items-center">
              <Text className="text-mute-500 text-sm" style={{ fontFamily: fontFamily.ui }}>
                Unlocks in {secondsRemaining}s
              </Text>
            </View>
          )}
        </View>
      ) : null}

      {error ? (
        <Text className="text-seal-500 text-sm mb-6" style={{ fontFamily: fontFamily.ui }}>
          {error}
        </Text>
      ) : null}

      <Text className="text-mute-500 text-sm mb-3" style={{ fontFamily: fontFamily.uiSemibold }}>
        Perks
      </Text>
      {info ? <PerksTable info={info} /> : null}
    </Screen>
  )
}

function PerksTable({ info }: { info: NonNullable<ReturnType<typeof useStakeInfo>['data']> }) {
  const rows: { tier: Tier; threshold: string; waivesFee: boolean }[] = [
    { tier: 'free', threshold: '0 SKR', waivesFee: false },
    { tier: 'member', threshold: `${formatBaseUnits(info.memberThreshold, SKR_DECIMALS)} SKR`, waivesFee: true },
    { tier: 'business', threshold: `${formatBaseUnits(info.businessThreshold, SKR_DECIMALS)} SKR`, waivesFee: true },
  ]

  return (
    <View className="bg-ink-900 border border-ink-800 rounded-2xl overflow-hidden">
      {rows.map((row, i) => (
        <View
          key={row.tier}
          className={`flex-row justify-between items-center px-4 py-3 ${i > 0 ? 'border-t border-ink-800' : ''} ${row.tier === info.tier ? 'bg-ink-800' : ''}`}
        >
          <View className="flex-row items-center gap-2">
            <TierBadge tier={row.tier} />
          </View>
          <Text className="text-mute-500 text-sm" style={{ fontFamily: fontFamily.ui }}>
            {row.threshold} · {row.waivesFee ? 'No send fee' : 'Send fee applies'}
          </Text>
        </View>
      ))}
    </View>
  )
}
