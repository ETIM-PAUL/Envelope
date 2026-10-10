// Phase 15: reads a Pot account directly off-chain (no bridge needed — it's public, unencrypted
// bookkeeping: host, pot_owner, name, close time, closed flag; never a balance). Used by the
// `envelope://pot/<potPda>` deep-link route to decide "show the host view" vs "let a guest
// contribute", and by anyone re-opening a pot link to see whether it's already closed.
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { address, type Base64EncodedDataResponse, type GetAccountInfoApi, type Rpc } from '@solana/kit'
import { useQuery } from '@tanstack/react-query'
import { decodePot } from './decode-pot'

// null when there's no pot at that address.
export async function fetchPot(rpc: Rpc<GetAccountInfoApi>, potPda: string) {
  const { value } = await rpc.getAccountInfo(address(potPda), { encoding: 'base64' }).send()
  if (!value) return null
  const [base64Data] = value.data as Base64EncodedDataResponse
  return decodePot(Uint8Array.from(Buffer.from(base64Data, 'base64')))
}

export function usePotAccount(potPda: string | null) {
  const { client } = useMobileWallet()

  return useQuery({
    queryKey: ['pot-account', potPda],
    enabled: Boolean(potPda),
    queryFn: () => fetchPot(client.rpc as unknown as Rpc<GetAccountInfoApi>, potPda!),
  })
}
