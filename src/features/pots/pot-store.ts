// Phase 15: per-device pot bookkeeping, reusing SecureStore rather than adding a new storage
// dependency for a handful of small records. The list is a cache, not the source of truth: every
// Pot account stores its host, so `syncPotSummaries` rebuilds it from chain — a reinstall or a
// new phone gets the host's open pots back.
import * as SecureStore from 'expo-secure-store'
import {
  getBase58Decoder,
  type Base58EncodedBytes,
  type Base64EncodedDataResponse,
  type GetProgramAccountsApi,
  type Rpc,
} from '@solana/kit'
import { decodePot, type DecodedPot } from './decode-pot'
import { ENVELOPE_VAULT_PROGRAM_ADDRESS } from './pot-pda'

// Anchor's account discriminator for `Pot` (anchor/target/idl/envelope_vault.json).
const POT_DISCRIMINATOR = new Uint8Array([238, 118, 60, 175, 178, 191, 59, 58])
const POT_HOST_OFFSET = 8 // right after the discriminator

export type PotSummary = {
  potId: string // stringified bigint
  potPda: string
  potOwnerAddress: string
  name: string
  closeTs: string // stringified bigint, unix seconds
  createdAt: number // Date.now(), local display only
}

function signatureKeyFor(owner: string, potId: string): string {
  return `envelope-pot-sig-${owner}-${potId}`
}

function listKeyFor(owner: string): string {
  return `envelope-pots-list-${owner}`
}

const AUTH_PROMPT = 'Unlock this pot'

// The pot's own derivation signature is as sensitive as the wallet's own (Phase 8) — whoever has
// it can reconstruct the pot's signing key — so it gets the same biometric gate. Best-effort, like
// saveDerivationSignature: where biometric-gated storage isn't available, reopening the pot asks
// the wallet to sign again instead.
export async function savePotSignature(owner: string, potId: string, signatureBase64: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(signatureKeyFor(owner, potId), signatureBase64, {
      requireAuthentication: true,
      authenticationPrompt: AUTH_PROMPT,
    })
    return true
  } catch {
    return false
  }
}

export async function readPotSignature(owner: string, potId: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(signatureKeyFor(owner, potId), {
      requireAuthentication: true,
      authenticationPrompt: AUTH_PROMPT,
    })
  } catch {
    return null
  }
}

// Not biometric-gated: just display metadata (name, close date), nothing that unlocks funds.
export async function listPotSummaries(owner: string): Promise<PotSummary[]> {
  const raw = await SecureStore.getItemAsync(listKeyFor(owner))
  if (!raw) return []
  try {
    return JSON.parse(raw) as PotSummary[]
  } catch {
    return []
  }
}

export async function addPotSummary(owner: string, summary: PotSummary): Promise<void> {
  const existing = await listPotSummaries(owner)
  const updated = [...existing.filter((p) => p.potId !== summary.potId), summary]
  await SecureStore.setItemAsync(listKeyFor(owner), JSON.stringify(updated))
}

// Merges the host's open pots found on chain into the local list (closed ones are dropped, as
// closing a pot here does) and returns the result. Keeps local entries the RPC doesn't return
// yet — a pot created a moment ago may not be visible to getProgramAccounts immediately.
export async function syncPotSummaries(rpc: Rpc<GetProgramAccountsApi>, owner: string): Promise<PotSummary[]> {
  const accounts = await rpc
    .getProgramAccounts(ENVELOPE_VAULT_PROGRAM_ADDRESS, {
      encoding: 'base64',
      filters: [
        {
          memcmp: {
            offset: 0n,
            bytes: getBase58Decoder().decode(POT_DISCRIMINATOR) as Base58EncodedBytes,
            encoding: 'base58',
          },
        },
        { memcmp: { offset: BigInt(POT_HOST_OFFSET), bytes: owner as Base58EncodedBytes, encoding: 'base58' } },
      ],
    })
    .send()
  const onChain: { potPda: string; pot: DecodedPot }[] = accounts.map(({ pubkey, account }) => {
    const [base64Data] = account.data as Base64EncodedDataResponse
    return { potPda: pubkey as string, pot: decodePot(Uint8Array.from(Buffer.from(base64Data, 'base64'))) }
  })
  const closed = new Set(onChain.filter(({ pot }) => pot.closed).map(({ potPda }) => potPda))

  const existing = await listPotSummaries(owner)
  const known = new Set(existing.map((p) => p.potPda))
  const recovered: PotSummary[] = onChain
    .filter(({ potPda, pot }) => !pot.closed && !known.has(potPda))
    .map(({ potPda, pot }) => ({
      potId: pot.potId.toString(),
      potPda,
      potOwnerAddress: pot.potOwner,
      name: pot.name,
      closeTs: pot.closeTs.toString(),
      createdAt: 0, // unknown for a recovered pot; display only
    }))
  const updated = [...existing.filter((p) => !closed.has(p.potPda)), ...recovered]
  if (recovered.length > 0 || updated.length !== existing.length) {
    await SecureStore.setItemAsync(listKeyFor(owner), JSON.stringify(updated))
  }
  return updated
}

export async function removePotSummary(owner: string, potId: string): Promise<void> {
  const existing = await listPotSummaries(owner)
  await SecureStore.setItemAsync(listKeyFor(owner), JSON.stringify(existing.filter((p) => p.potId !== potId)))
}
