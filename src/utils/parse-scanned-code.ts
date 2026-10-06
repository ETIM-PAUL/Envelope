// Turns whatever a scanned QR code holds into something Send can act on. Envelope's own codes are
// `envelope://pay/<owner>` (Receive) and `envelope://pot/<potPda>` (a pot invite); other wallets
// show a bare address or a Solana Pay `solana:<address>?…` URI; tip links are
// `<TIP_SITE_URL>/<owner>`. Anything else — including a Solana Pay *transaction request*
// (`solana:https://…`), which needs a merchant server Envelope doesn't talk to — is rejected.
import { isAddress } from '@solana/kit'
import { TIP_SITE_URL } from '../config/site'

export type ScannedCode = { kind: 'recipient'; address: string } | { kind: 'pot'; potPda: string }

function firstPathSegment(rest: string): string {
  return rest.split(/[/?#]/)[0] ?? ''
}

export function parseScannedCode(raw: string): ScannedCode | null {
  const text = raw.trim()
  if (isAddress(text)) return { kind: 'recipient', address: text }

  if (text.startsWith('envelope://pot/')) {
    const potPda = firstPathSegment(text.slice('envelope://pot/'.length))
    return isAddress(potPda) ? { kind: 'pot', potPda } : null
  }

  let candidate: string | null = null
  if (text.startsWith('envelope://pay/')) candidate = firstPathSegment(text.slice('envelope://pay/'.length))
  else if (text.startsWith('solana:')) candidate = firstPathSegment(text.slice('solana:'.length))
  else if (text.startsWith(`${TIP_SITE_URL}/`)) candidate = firstPathSegment(text.slice(TIP_SITE_URL.length + 1))

  return candidate && isAddress(candidate) ? { kind: 'recipient', address: candidate } : null
}
