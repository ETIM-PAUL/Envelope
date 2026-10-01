// Hand-decodes envelope_vault's `Pot` account instead of importing the generated Anchor client
// (anchor/src/client/js/generated/envelopeVault) into the RN bundle — that client pulls in IDL
// JSON files via relative paths across the monorepo, which Metro (unlike esbuild, used for
// packages/cbridge) isn't confirmed to resolve cleanly, and this account's layout is simple and
// fixed. Mirrors the exact field order in anchor/programs/envelope_vault/src/state.rs's `Pot`
// struct (host, potId, potOwner, potTokenAccount, name, closeTs, closed, bump) — if that struct
// changes, update this decoder to match.
import { getAddressDecoder, type Address } from '@solana/kit'

export type DecodedPot = {
  host: Address
  potId: bigint
  potOwner: Address
  potTokenAccount: Address
  name: string
  closeTs: bigint
  closed: boolean
  bump: number
}

const DISCRIMINATOR_SIZE = 8
const PUBKEY_SIZE = 32
const NAME_SIZE = 32

export function decodePot(data: Uint8Array): DecodedPot {
  const addressDecoder = getAddressDecoder()
  let offset = DISCRIMINATOR_SIZE

  function readAddress(): Address {
    const value = addressDecoder.decode(data, offset)
    offset += PUBKEY_SIZE
    return value
  }

  function readU64LE(): bigint {
    const value = new DataView(data.buffer, data.byteOffset + offset, 8).getBigUint64(0, true)
    offset += 8
    return value
  }

  function readI64LE(): bigint {
    const value = new DataView(data.buffer, data.byteOffset + offset, 8).getBigInt64(0, true)
    offset += 8
    return value
  }

  const host = readAddress()
  const potId = readU64LE()
  const potOwner = readAddress()
  const potTokenAccount = readAddress()
  const nameBytes = data.subarray(offset, offset + NAME_SIZE)
  offset += NAME_SIZE
  const closeTs = readI64LE()
  const closed = data[offset] !== 0
  offset += 1
  const bump = data[offset]!

  const nullIndex = nameBytes.indexOf(0)
  const name = new TextDecoder().decode(nullIndex === -1 ? nameBytes : nameBytes.subarray(0, nullIndex))

  return { host, potId, potOwner, potTokenAccount, name, closeTs, closed, bump }
}
