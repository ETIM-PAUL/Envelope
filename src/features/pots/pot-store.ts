// Phase 15: local, per-device pot bookkeeping. There's no on-chain index of "every pot a wallet
// has created" (envelope_vault's Pot PDA is keyed by host+potId, not enumerable), so the Pots tab
// keeps its own small list — same spirit as Phase 8's persisted derivation signature, reusing
// SecureStore rather than adding a new storage dependency for a handful of small records.
import * as SecureStore from 'expo-secure-store'

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
// it can reconstruct the pot's signing key — so it gets the same biometric gate.
export async function savePotSignature(owner: string, potId: string, signatureBase64: string): Promise<void> {
  await SecureStore.setItemAsync(signatureKeyFor(owner, potId), signatureBase64, {
    requireAuthentication: true,
    authenticationPrompt: AUTH_PROMPT,
  })
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

export async function removePotSummary(owner: string, potId: string): Promise<void> {
  const existing = await listPotSummaries(owner)
  await SecureStore.setItemAsync(listKeyFor(owner), JSON.stringify(existing.filter((p) => p.potId !== potId)))
}
