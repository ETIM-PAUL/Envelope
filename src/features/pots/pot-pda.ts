// Hand-derives the Pot PDA — same reasoning as decode-pot.ts: avoids importing the generated
// Anchor client into the RN bundle. Mirrors anchor/src/client/js/generated/envelopeVault/pdas/
// pot.ts's seeds exactly: ["pot", host, potId as little-endian u64]. If envelope_vault's PDA
// seeds ever change, update both this and that generated file together (they're already
// independent copies of the same constant, same as cbridge's own copy of program constants).
import { getAddressEncoder, getProgramDerivedAddress, type Address } from '@solana/kit'

export const ENVELOPE_VAULT_PROGRAM_ADDRESS = '43kwURZxpDniSpWPSfxyqUSc3kwuaCEmAJmSKtqdxMXi' as Address

export async function findPotPda(host: Address, potId: bigint): Promise<Address> {
  const potIdBytes = new Uint8Array(8)
  new DataView(potIdBytes.buffer).setBigUint64(0, potId, true)

  const [pda] = await getProgramDerivedAddress({
    programAddress: ENVELOPE_VAULT_PROGRAM_ADDRESS,
    seeds: [new TextEncoder().encode('pot'), getAddressEncoder().encode(host), potIdBytes],
  })
  return pda
}
