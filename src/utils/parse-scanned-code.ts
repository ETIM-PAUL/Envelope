// Turns whatever a scanned QR code holds into something Send can act on. Envelope's own codes are
// `envelope://pay/<owner>` (Receive) and `envelope://pot/<potPda>` (a pot invite); other wallets
// show a bare address or a Solana Pay `solana:<address>?…` URI; tip links are
// `<TIP_SITE_URL>/<owner>`; gift links are `<site>/gift#<secret>` or `envelope://gift?k=<secret>`.
// Anything else — including a Solana Pay *transaction request*
// (`solana:https://…`), which needs a merchant server Envelope doesn't talk to — is rejected.
import { isAddress } from '@solana/kit'
import { TIP_SITE_URL } from '../config/site'
import { isGiftSecret } from '../features/gifts/gift-link'

// `assets`: the recipient's `?assets=` preference from an Envelope code or tip link, verbatim
// (send-confirm parses it), when there is one.
export type ScannedCode =
  | { kind: 'recipient'; address: string; assets?: string }
  | { kind: 'pot'; potPda: string }
  | { kind: 'gift'; secret: string }

// Parsed by hand: React Native's URLSearchParams doesn't implement get() on every version.
function assetsParam(text: string): string | undefined {
  const query = text.split('?')[1]?.split('#')[0] ?? ''
  for (const pair of query.split('&')) {
    const [key, value] = pair.split('=')
    if (key === 'assets' && value) return decodeURIComponent(value)
  }
  return undefined
}

function firstPathSegment(rest: string): string {
  return rest.split(/[/?#]/)[0] ?? ''
}

export function parseScannedCode(raw: string): ScannedCode | null {
  const text = raw.trim()
  if (isAddress(text)) return { kind: 'recipient', address: text }

  // A gift link from any Envelope site (the page is served wherever the relayer runs).
  const giftSecret = text.startsWith('envelope://gift?k=')
    ? text.slice('envelope://gift?k='.length).split(/[&#]/)[0]
    : /^https?:\/\/[^#]+\/gift#/.test(text)
      ? text.split('#')[1]
      : undefined
  if (giftSecret !== undefined) return isGiftSecret(giftSecret) ? { kind: 'gift', secret: giftSecret } : null

  if (text.startsWith('envelope://pot/')) {
    const potPda = firstPathSegment(text.slice('envelope://pot/'.length))
    return isAddress(potPda) ? { kind: 'pot', potPda } : null
  }

  let candidate: string | null = null
  if (text.startsWith('envelope://pay/')) candidate = firstPathSegment(text.slice('envelope://pay/'.length))
  else if (text.startsWith('solana:')) candidate = firstPathSegment(text.slice('solana:'.length))
  else if (text.startsWith(`${TIP_SITE_URL}/`)) candidate = firstPathSegment(text.slice(TIP_SITE_URL.length + 1))

  if (!candidate || !isAddress(candidate)) return null
  // Solana Pay's own query (amount, spl-token…) isn't ours; only Envelope codes carry `assets`.
  const assets = text.startsWith('solana:') ? undefined : assetsParam(text)
  return { kind: 'recipient', address: candidate, ...(assets ? { assets } : {}) }
}
