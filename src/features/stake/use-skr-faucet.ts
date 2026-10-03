// Devnet test-SKR faucet, served by the relayer (relayer/src/faucet.ts) — it holds the SKR, so the
// mint-authority key never touches the app. Limits are enforced there: 500 SKR per rolling 24h,
// never past 6,000 SKR held (wallet + staked).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RELAYER_URL } from '../../config/relayer'
import { useAppStore } from '../../store/app-store'
import { recordNotification } from '../notifications/notification-log'

export type FaucetStatus = {
  held: string
  claimedToday: string
  dailyLimit: string
  maxHeld: string
  available: string
  nextClaimAt: number | null
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null
  if (!response.ok || !body || body.error) throw new Error(body?.error ?? `faucet request failed (${response.status})`)
  return body
}

export function useSkrFaucet() {
  const walletAddress = useAppStore((s) => s.walletAddress)
  const queryClient = useQueryClient()

  const status = useQuery({
    queryKey: ['skr-faucet', walletAddress],
    enabled: Boolean(walletAddress),
    queryFn: async () => readJson<FaucetStatus>(await fetch(`${RELAYER_URL}/faucet/skr/${walletAddress}`)),
  })

  const claim = useMutation({
    mutationFn: async () =>
      readJson<{ amount: string; signature: string }>(
        await fetch(`${RELAYER_URL}/faucet/skr`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ wallet: walletAddress }),
        }),
      ),
    onSuccess: async ({ amount, signature }) => {
      await recordNotification(walletAddress!, { id: `faucet-${signature}`, kind: 'faucet', amount })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['skr-faucet', walletAddress] })
      void queryClient.invalidateQueries({ queryKey: ['stake-info', walletAddress] })
    },
  })

  return { status: status.data, claim }
}
