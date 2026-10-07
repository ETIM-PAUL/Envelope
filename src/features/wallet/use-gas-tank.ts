// The wallet's gas tank (packages/cbridge/src/bridge.ts's gasTanks) pays rent and network fees —
// withdraw proofs, pot setup and sweeps, account setup, deposits, membership passes — so the
// wallet itself never needs SOL. Call this before any such flow; when the tank is low it's
// refuelled by the relayer with SKR fuel (relayer/src/fuel.ts):
//   - included (Members, and every wallet's first refill): sent by the relayer, no approval;
//   - paid (Free): the wallet approves one small SKR payment;
//   - no SKR for the fee: falls back to the old way, the wallet topping it up with its own SOL.
import { useCBridge } from '@envelope/rn-confidential'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import {
  address,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  type GetBalanceApi,
  type GetSignatureStatusesApi,
  type Rpc,
  type SendTransactionApi,
} from '@solana/kit'
import { useCallback } from 'react'
import { RELAYER_URL } from '../../config/relayer'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { useAppStore } from '../../store/app-store'
import { withNetworkRetry } from '../../utils/network-retry'
import { retryOnExpiry } from '../../utils/retry-on-expiry'
import { sendSignedTransactions } from '../../utils/send-signed-transactions'
import { useWalletSigning } from './use-wallet-signing'

// Matches the relayer's fuelConfig.refillBelowLamports: no point asking below it.
const REFILL_BELOW_LAMPORTS = 10_000_000n

type FuelResponse =
  { status: 'not-needed' | 'sent' } | { status: 'quote'; transaction: string; priceSkr: string } | { error: string }

async function postJson(path: string, body: unknown): Promise<FuelResponse & { signature?: string }> {
  const response = await withNetworkRetry(() =>
    fetch(`${RELAYER_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  // A relayer without fuel (older deploy, or disabled) answers 404 with no JSON body.
  const parsed = (await response.json().catch(() => null)) as (FuelResponse & { signature?: string }) | null
  return parsed ?? { error: `fuel unavailable (${response.status})` }
}

export function useGasTank() {
  const bridge = useCBridge()
  const { client } = useMobileWallet()
  const { signTransactions } = useWalletSigning()
  const walletAddress = useAppStore((s) => s.walletAddress)

  // The old path: the wallet tops the tank up with its own SOL (one approval).
  const topUpFromWallet = useCallback(async (): Promise<void> => {
    await retryOnExpiry(async () => {
      const { signedTransactions } = await bridge.call('ensureGasTank', {
        rpcUrl: DEVNET_RPC_URL,
        owner: walletAddress!,
      })
      await sendSignedTransactions(
        client.rpc as unknown as Rpc<SendTransactionApi & GetSignatureStatusesApi>,
        signedTransactions,
      )
    })
  }, [bridge, client, walletAddress])

  const ensureGasTank = useCallback(async (): Promise<void> => {
    if (!walletAddress) throw new Error('connect a wallet first')
    const { address: tank } = await bridge.call('gasTankAddress', { owner: walletAddress })
    const rpc = client.rpc as unknown as Rpc<GetBalanceApi>
    const { value: balance } = await withNetworkRetry(() => rpc.getBalance(address(tank)).send())
    if (balance >= REFILL_BELOW_LAMPORTS) return

    const fuel = await postJson('/fuel', { owner: walletAddress, tank }).catch((error: unknown) => ({
      error: error instanceof Error ? error.message : 'fuel unavailable',
    }))
    if ('error' in fuel) {
      // No SKR for the fee, daily cap reached, or no fuel on this relayer: the wallet's own SOL
      // still works, the way the tank was always topped up before SKR fuel.
      return topUpFromWallet()
    }
    if (fuel.status !== 'quote') return
    const quoted = getTransactionDecoder().decode(Buffer.from(fuel.transaction, 'base64'))

    await retryOnExpiry(async () => {
      const [signed] = await signTransactions([quoted])
      const submitted = await postJson('/fuel/submit', {
        owner: walletAddress,
        transaction: getBase64EncodedWireTransaction(signed!),
      })
      if ('error' in submitted) throw new Error(submitted.error)
    })
  }, [bridge, client, walletAddress, signTransactions, topUpFromWallet])

  return { ensureGasTank }
}
