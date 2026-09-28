import {
  createClientWithGetMinimumBalanceFromRpc,
  generateKeyPairSigner,
  type Address,
  type KeyPairSigner,
  type Rpc,
  type RpcSubscriptions,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
} from '@solana/kit'
import {
  getCreateMintInstructionPlan as getCreateClassicMintInstructionPlan,
  getMintToATAInstructionPlanAsync as getMintToClassicATAInstructionPlanAsync,
} from '@solana-program/token'
import {
  getCreateMintInstructionPlan as getCreateToken2022MintInstructionPlan,
  getMintToATAInstructionPlanAsync as getMintToToken2022ATAInstructionPlanAsync,
} from '@solana-program/token-2022'
import { sendInstructionPlan } from './send-plan'

type Clients = {
  rpc: Rpc<SolanaRpcApi>
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>
}

// Plain mints only — no confidential-transfer extension. envelope_vault's wrap/unwrap never touch
// cUSDC's confidential side (that's Phase 2's roundtrip, tested separately); a bare Token-2022
// mint is all these tests need and keeps setup fast.
export async function createMint(
  { rpc, rpcSubscriptions }: Clients,
  payer: KeyPairSigner,
  { decimals = 6, token2022 = false }: { decimals?: number; token2022?: boolean } = {},
): Promise<KeyPairSigner> {
  const client = createClientWithGetMinimumBalanceFromRpc(rpc)
  const mint = await generateKeyPairSigner()
  // The two packages' `mintAuthority` types differ (classic wants `Address`, Token-2022 wants a
  // `TransactionSigner`), so this can't share one `getPlan(...)` call across both branches.
  const plan = token2022
    ? await getCreateToken2022MintInstructionPlan(client, { payer, newMint: mint, decimals, mintAuthority: payer })
    : await getCreateClassicMintInstructionPlan(client, {
        payer,
        newMint: mint,
        decimals,
        mintAuthority: payer.address,
      })
  await sendInstructionPlan(plan, payer, rpc, rpcSubscriptions)
  return mint
}

// Mints `amount` to `owner`'s ATA (creating it if needed), authority = payer. `token2022` must
// match how the mint was created (see `createMint`) — the classic and Token-2022 packages each
// default to their own token program, not whichever the mint account actually belongs to.
export async function mintTo(
  { rpc, rpcSubscriptions }: Clients,
  payer: KeyPairSigner,
  mint: Address,
  owner: Address,
  amount: bigint,
  { decimals = 6, token2022 = false }: { decimals?: number; token2022?: boolean } = {},
): Promise<void> {
  const getPlan = token2022 ? getMintToToken2022ATAInstructionPlanAsync : getMintToClassicATAInstructionPlanAsync
  const plan = await getPlan({
    payer,
    owner,
    mint,
    mintAuthority: payer,
    amount,
    decimals,
  })
  await sendInstructionPlan(plan, payer, rpc, rpcSubscriptions)
}
