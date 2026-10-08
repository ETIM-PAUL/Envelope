// Membership: buy or extend an SKR pass (Member / Business) and see what each tier gets. The pass
// is spent SKR, not staked (envelope_stake `buy_pass`); old stakes still count until withdrawn,
// and existing stakers can unstake here. Perks come from the relayer (it enforces them), prices
// from the chain — see use-membership.ts.
import * as Haptics from 'expo-haptics'
import { useEffect, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Button } from '../../components/button'
import { Screen } from '../../components/screen'
import { TierBadge } from '../../components/tier-badge'
import { colors, fontFamily } from '../../design/tokens'
import { useStakeInfo } from '../../features/stake/use-stake-info'
import { useSkrFaucet } from '../../features/stake/use-skr-faucet'
import { useStakeActions } from '../../features/stake/use-stake-actions'
import { useMembership, type PaidTier } from '../../features/stake/use-membership'
import type { TierPerks } from '../../features/account/use-tier'
import { formatAssetAmount } from '../../config/assets'
import { formatBaseUnits } from '../../utils/format-amount'
import { formatError } from '../../utils/format-error'
import type { Tier } from '../../store/app-store'

const SKR_DECIMALS = 6
const TIER_ORDER: Record<Tier, number> = { free: 0, member: 1, business: 2 }

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

const UNLIMITED = 18_446_744_073_709_551_615n // u64::MAX: the vault's "no limit"
const TIER_NAME: Record<Tier, string> = { free: 'Free', member: 'Member', business: 'Business' }

function perkLines(perks: TierPerks, dailyLimit: bigint | undefined): string[] {
  return [
    perks.fuelIncluded ? 'No SOL needed — fees and rent covered' : 'Network fees paid in SKR (2 SKR per refill)',
    dailyLimit === undefined
      ? 'Daily dollar limit'
      : dailyLimit >= UNLIMITED
        ? 'Add unlimited dollars a day'
        : `Add up to ${formatAssetAmount(dailyLimit, 'usdc')} a day`,
    perks.sendFeeWaived ? 'No send fees' : '0.001 SKR per private send',
    `Send to ${perks.maxBatchRecipients} people at once`,
    perks.maxOpenPots === null
      ? 'Unlimited open pots'
      : `${perks.maxOpenPots} open pot${perks.maxOpenPots === 1 ? '' : 's'} at a time`,
    perks.multiTokenPots ? 'Pots in dollars and SKR' : 'Pots in one token',
  ]
}

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Membership() {
  const { data: info, refetch } = useStakeInfo()
  const { plans, status, buy } = useMembership()
  const [now] = useState(() => Math.floor(Date.now() / 1000))
  const previousTier = useRef<Tier | null>(null)

  const tier: Tier = status?.tier ?? 'free'
  const pass = status?.pass ?? null
  const passActive = pass !== null && pass.expiresAt > now
  const viaStake = tier !== 'free' && !(passActive && pass?.tier === tier)

  useEffect(() => {
    if (!status) return
    if (previousTier.current && TIER_ORDER[status.tier] > TIER_ORDER[previousTier.current]) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    }
    previousTier.current = status.tier
  }, [status])

  return (
    <Screen scroll>
      <View className="flex-row justify-between items-center mb-6">
        <Text className="text-paper-500 text-2xl" style={{ fontFamily: fontFamily.display }}>
          Membership
        </Text>
        <TierBadge tier={tier} />
      </View>

      <View className="bg-ink-900 border border-ink-800 rounded-3xl py-7 px-5 items-center mb-6">
        <Text className="text-mute-500 text-sm mb-1" style={{ fontFamily: fontFamily.ui }}>
          Your plan
        </Text>
        <Text style={{ fontFamily: fontFamily.display, fontSize: 34, color: colors.paper[500] }}>
          {TIER_NAME[tier]}
        </Text>
        <Text className="text-mute-500 text-sm mt-1 text-center" style={{ fontFamily: fontFamily.ui }}>
          {passActive && !viaStake
            ? `Until ${formatDate(pass!.expiresAt)}`
            : viaStake
              ? 'Through your staked SKR'
              : 'Upgrade with SKR — spent'}
        </Text>
        <Text className="text-mute-600 text-xs mt-4" style={{ fontFamily: fontFamily.ui }}>
          {info ? `${formatBaseUnits(info.skrBalance, SKR_DECIMALS)} SKR in your wallet` : 'Loading…'}
        </Text>
        <FaucetRow />
      </View>

      {status ? (
        <FreePlanCard perks={status.allPerks.free} dailyLimit={plans?.dailyLimits.free} isCurrent={tier === 'free'} />
      ) : null}

      {(['member', 'business'] as const).map((planTier) => (
        <PlanCard
          key={planTier}
          planTier={planTier}
          currentTier={tier}
          passActive={passActive}
          passTier={pass?.tier ?? null}
          price={plans?.prices[planTier]}
          periodDays={plans?.periodDays}
          perks={status?.allPerks[planTier]}
          dailyLimit={plans?.dailyLimits[planTier]}
          skrBalance={info?.skrBalance}
          busy={buy.isPending && buy.variables?.tier === planTier}
          disabled={buy.isPending}
          onBuy={() => buy.mutate({ tier: planTier }, { onSuccess: () => void refetch() })}
        />
      ))}

      {buy.error ? (
        <Text className="text-seal-500 text-sm mb-4 text-center" style={{ fontFamily: fontFamily.ui }}>
          {formatError(buy.error)}
        </Text>
      ) : null}

      {info && info.stakedAmount > 0n ? <LegacyStake /> : null}
    </Screen>
  )
}

// The Free plan: what every wallet gets, nothing to buy.
function FreePlanCard({
  perks,
  dailyLimit,
  isCurrent,
}: {
  perks: TierPerks
  dailyLimit: bigint | undefined
  isCurrent: boolean
}) {
  return (
    <View className={`bg-ink-900 border rounded-3xl p-5 mb-4 ${isCurrent ? 'border-paper-400' : 'border-ink-800'}`}>
      <View className="flex-row justify-between items-center mb-3">
        <TierBadge tier="free" />
        <Text className="text-paper-500" style={{ fontFamily: fontFamily.uiSemibold, fontSize: 15 }}>
          Free
        </Text>
      </View>
      <View className="gap-1.5">
        {[...perkLines(perks, dailyLimit), 'First fuel refill on us'].map((line) => (
          <Text key={line} className="text-paper-400 text-sm" style={{ fontFamily: fontFamily.ui }}>
            ✓ {line}
          </Text>
        ))}
      </View>
      {isCurrent ? (
        <Text className="text-mute-500 text-sm mt-4 text-center" style={{ fontFamily: fontFamily.uiSemibold }}>
          Your current plan
        </Text>
      ) : null}
    </View>
  )
}

function PlanCard({
  planTier,
  currentTier,
  passActive,
  passTier,
  price,
  periodDays,
  perks,
  dailyLimit,
  skrBalance,
  busy,
  disabled,
  onBuy,
}: {
  planTier: PaidTier
  currentTier: Tier
  passActive: boolean
  passTier: PaidTier | null
  price: bigint | undefined
  periodDays: number | undefined
  perks: TierPerks | undefined
  dailyLimit: bigint | undefined
  skrBalance: bigint | undefined
  busy: boolean
  disabled: boolean
  onBuy: () => void
}) {
  const isCurrent = currentTier === planTier
  const coveredByHigher = TIER_ORDER[currentTier] > TIER_ORDER[planTier]
  const upgrading = passActive && passTier === 'member' && planTier === 'business'
  const extending = passActive && passTier === planTier
  const shortOfSkr = price !== undefined && skrBalance !== undefined && skrBalance < price
  const priceLabel = price !== undefined ? `${formatBaseUnits(price, SKR_DECIMALS).replace('.00', '')} SKR` : '…'
  const period = periodDays !== undefined ? `${periodDays} days` : '…'

  const label = coveredByHigher
    ? `Included in ${TIER_NAME[currentTier]}`
    : shortOfSkr
      ? `Needs ${priceLabel}`
      : extending
        ? `Extend ${period} · ${priceLabel}`
        : upgrading
          ? `Upgrade · ${priceLabel}`
          : `Get ${TIER_NAME[planTier]} · ${priceLabel}`

  return (
    <View className={`bg-ink-900 border rounded-3xl p-5 mb-4 ${isCurrent ? 'border-paper-400' : 'border-ink-800'}`}>
      <View className="flex-row justify-between items-center mb-3">
        <TierBadge tier={planTier} />
        <Text className="text-paper-500" style={{ fontFamily: fontFamily.uiSemibold, fontSize: 15 }}>
          {priceLabel} <Text className="text-mute-500">/ {period}</Text>
        </Text>
      </View>
      <View className="gap-1.5 mb-4">
        {perks
          ? perkLines(perks, dailyLimit).map((line) => (
              <Text key={line} className="text-paper-400 text-sm" style={{ fontFamily: fontFamily.ui }}>
                ✓ {line}
              </Text>
            ))
          : null}
      </View>
      <Button
        label={busy ? 'Waiting for approval…' : label}
        variant={isCurrent ? 'secondary' : 'primary'}
        onPress={onBuy}
        disabled={disabled || coveredByHigher || shortOfSkr || price === undefined}
        busy={busy}
      />
      {upgrading ? (
        <Text className="text-mute-600 text-xs mt-2 text-center" style={{ fontFamily: fontFamily.ui }}>
          Business starts now; the rest of your Member time isn&apos;t refunded.
        </Text>
      ) : null}
    </View>
  )
}

// Staking is being replaced by the pass; existing stakes still count toward the tier, and this is
// how their owners get their SKR back.
function LegacyStake() {
  const { data: info, refetch } = useStakeInfo()
  const { requestUnstake, withdrawUnstaked } = useStakeActions()
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const unlockAtMs =
    info && info.unlockRequestedAt > 0n ? Number(info.unlockRequestedAt + info.cooldownSecs) * 1000 : null
  const secondsRemaining = useCountdown(unlockAtMs)
  const cooldownElapsed = unlockAtMs !== null && secondsRemaining === 0
  if (!info) return null

  async function run(action: () => Promise<unknown>) {
    if (isBusy) return
    setIsBusy(true)
    setError(null)
    try {
      await action()
      await refetch()
    } catch (e) {
      setError(formatError(e))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <View className="bg-ink-900 border border-ink-800 rounded-2xl p-5 mb-6">
      <Text className="text-paper-500 text-base mb-1" style={{ fontFamily: fontFamily.uiSemibold }}>
        {formatBaseUnits(info.stakedAmount, SKR_DECIMALS)} SKR staked
      </Text>
      <Text className="text-mute-500 text-sm mb-4" style={{ fontFamily: fontFamily.ui }}>
        Staking is being replaced by membership. Your stake still counts until you withdraw it.
      </Text>
      {info.unlockRequestedAt === 0n ? (
        <Button
          label={isBusy ? 'Requesting…' : 'Unstake'}
          variant="secondary"
          onPress={() => void run(requestUnstake)}
          busy={isBusy}
        />
      ) : cooldownElapsed ? (
        <Button
          label={isBusy ? 'Withdrawing…' : 'Withdraw unstaked SKR'}
          onPress={() => void run(withdrawUnstaked)}
          busy={isBusy}
        />
      ) : (
        <Text className="text-mute-500 text-sm text-center" style={{ fontFamily: fontFamily.ui }}>
          Unlocks in {secondsRemaining}s
        </Text>
      )}
      {error ? (
        <Text className="text-seal-500 text-sm mt-3" style={{ fontFamily: fontFamily.ui }}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}
