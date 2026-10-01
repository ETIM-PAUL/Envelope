// Phase 13: asks the relayer what tier a wallet is (GET /tier/:wallet) rather than re-reading
// envelope_stake's on-chain accounts in a second runtime — the relayer already computes this for
// its own /relay policy check (relayer/src/tier.ts), and the response carries the exact
// freeTierFeeAmount/skrMint/relayerAddress the client needs to build a compliant free-tier send,
// so there's no risk of the app's copy of those numbers drifting from the relayer's.
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { RELAYER_URL } from '../../config/relayer'
import { useAppStore, type Tier } from '../../store/app-store'

export type TierInfo = {
  tier: Tier
  relayerAddress: string
  skrMint: string
  freeTierFeeAmount: string // stringified bigint, base units
}

export async function fetchTierInfo(owner: string): Promise<TierInfo> {
  const response = await fetch(`${RELAYER_URL}/tier/${owner}`)
  const body = (await response.json().catch(() => null)) as (TierInfo & { error?: string }) | null
  if (!response.ok || !body || body.error) {
    throw new Error(body?.error ?? `tier lookup failed with status ${response.status}`)
  }
  return body
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
