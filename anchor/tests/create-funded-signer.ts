import {
  airdropFactory,
  generateKeyPairSigner,
  lamports,
  type createSolanaRpc,
  type createSolanaRpcSubscriptions,
  type GetSignatureStatusesApi,
  type KeyPairSigner,
  type Lamports,
  type RequestAirdropApi,
  type Rpc,
  type RpcSubscriptions,
  type SignatureNotificationsApi,
} from '@solana/kit'

// Generates a fresh keypair signer (or funds a given one — see test-admin.ts) with an airdrop.
// Using a new signer per run keeps most tests independent of earlier state, so they pass against
// any validator with a faucet — not just the throwaway one that `anchor test` starts.
export async function createFundedSigner({
  amount = lamports(5_000_000_000n),
  rpc,
  rpcSubscriptions,
  signer,
}: {
  amount?: Lamports
  rpc: ReturnType<typeof createSolanaRpc>
  rpcSubscriptions: ReturnType<typeof createSolanaRpcSubscriptions>
  signer?: KeyPairSigner
}): Promise<KeyPairSigner> {
  const resolvedSigner = signer ?? (await generateKeyPairSigner())
  // Airdrops only exist on test clusters, which the rpc type can't know statically.
  const airdrop = airdropFactory({
    rpc: rpc as unknown as Rpc<GetSignatureStatusesApi & RequestAirdropApi>,
    rpcSubscriptions: rpcSubscriptions as unknown as RpcSubscriptions<SignatureNotificationsApi>,
  })
  await airdrop({ commitment: 'confirmed', lamports: amount, recipientAddress: resolvedSigner.address })
  return resolvedSigner
}
