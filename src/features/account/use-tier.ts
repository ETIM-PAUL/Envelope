// Phase 13: asks the relayer what tier a wallet is (GET /tier/:wallet) rather than re-reading
// envelope_stake's on-chain accounts in a second runtime — the relayer already computes this for
// its own /relay policy check (relayer/src/tier.ts), and the response carries the exact
// freeTierFeeAmount/skrMint/relayerAddress the client needs to build a compliant free-tier send,
// so there's no risk of the app's copy of those numbers drifting from the relayer's.
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { RELAYER_URL } from '../../config/relayer'
import { useAppStore, type Tier } from '../../store/app-store'

// Mirrors relayer/src/config.ts's TierPerks: the relayer is the source of truth for what each tier
// gets (it enforces the batch size and send fee itself).
export type TierPerks = {
  maxBatchRecipients: number
  maxOpenPots: number | null // null: unlimited
  multiTokenPots: boolean
  sendFeeWaived: boolean
  fuelIncluded: boolean
}

export type TierInfo = {
  tier: Tier
  relayerAddress: string
  skrMint: string
  freeTierFeeAmount: string // stringified bigint, base units
  perks: TierPerks
  allPerks: Record<Tier, TierPerks>
  // The membership pass, if one was ever bought (expiresAt: unix seconds; may be in the past).
  pass: { tier: 'member' | 'business'; expiresAt: number } | null
}

export async function fetchTierInfo(owner: string): Promise<TierInfo> {
  const response = await fetch(`${RELAYER_URL}/tier/${owner}`)
  const body = (await response.json().catch(() => null)) as (TierInfo & { error?: string }) | null
  if (!response.ok || !body || body.error) {
    throw new Error(body?.error ?? `tier lookup failed with status ${response.status}`)
  }
  // A relayer from before membership perks reports only the tier: assume Free's perks, the safe
  // default, rather than failing every screen that reads them.
  const allPerks = body.allPerks ?? FALLBACK_PERKS
  return { ...body, perks: body.perks ?? allPerks.free, allPerks, pass: body.pass ?? null }
}

const FALLBACK_PERKS: Record<Tier, TierPerks> = {
  free: { maxBatchRecipients: 3, maxOpenPots: 1, multiTokenPots: false, sendFeeWaived: false, fuelIncluded: false },
  member: { maxBatchRecipients: 10, maxOpenPots: 5, multiTokenPots: true, sendFeeWaived: true, fuelIncluded: true },
  business: {
    maxBatchRecipients: 25,
    maxOpenPots: null,
    multiTokenPots: true,
    sendFeeWaived: true,
    fuelIncluded: true,
  },
}

export function useTier(walletAddress: string | null) {
  const setTier = useAppStore((s) => s.setTier)

  const query = useQuery({
    queryKey: ['tier', walletAddress],
    enabled: Boolean(walletAddress),
    queryFn: () => fetchTierInfo(walletAddress!),
  })

  useEffect(() => {
    if (query.data) setTier(query.data.tier)
  }, [query.data, setTier])

  return query
}
