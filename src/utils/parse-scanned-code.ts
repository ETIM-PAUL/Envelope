// Turns whatever a scanned QR code holds into something Send can act on. Envelope's own codes are
// `envelope://pay/<owner>` (Receive) and `envelope://pot/<potPda>` (a pot invite); other wallets
// show a bare address or a Solana Pay `solana:<address>?…` URI; tip links are
// `<site>/tip/<owner>` (any host: links from older builds pointed at a placeholder site); gift links are `<site>/gift#<secret>[.<message>]` or `envelope://gift?k=<secret>[&m=<message>]`.
// Anything else — including a Solana Pay *transaction request*
// (`solana:https://…`), which needs a merchant server Envelope doesn't talk to — is rejected.
import { isAddress } from '@solana/kit'
import { isGiftSecret, splitGiftFragment } from '../features/gifts/gift-link'

// `assets`: the recipient's `?assets=` preference from an Envelope code or tip link, verbatim
// (send-confirm parses it), when there is one.
export type ScannedCode =
  | { kind: 'recipient'; address: string; assets?: string }
  | { kind: 'pot'; potPda: string }
  | { kind: 'gift'; secret: string; encodedMessage?: string } // the message still encoded (gift-link.ts)

// Parsed by hand: React Native's URLSearchParams doesn't implement get() on every version.
function queryParam(text: string, name: string): string | undefined {
  const query = text.split('?')[1]?.split('#')[0] ?? ''
  for (const pair of query.split('&')) {
    const [key, value] = pair.split('=')
    if (key === name && value) return decodeURIComponent(value)
  }
  return undefined
}

const assetsParam = (text: string) => queryParam(text, 'assets')

function firstPathSegment(rest: string): string {
  return rest.split(/[/?#]/)[0] ?? ''
}

export function parseScannedCode(raw: string): ScannedCode | null {
  const text = raw.trim()
  if (isAddress(text)) return { kind: 'recipient', address: text }

  // A gift link from any Envelope site (the page is served wherever the relayer runs).
  const gift = text.startsWith('envelope://gift?')
    ? (() => {
        const encodedMessage = queryParam(text, 'm')
        return { secret: queryParam(text, 'k') ?? '', ...(encodedMessage ? { encodedMessage } : {}) }
      })()
    : /^https?:\/\/[^#]+\/gift#/.test(text)
      ? splitGiftFragment(text.split('#')[1] ?? '')
      : undefined
  if (gift !== undefined) return isGiftSecret(gift.secret) ? { kind: 'gift', ...gift } : null

  if (text.startsWith('envelope://pot/')) {
    const potPda = firstPathSegment(text.slice('envelope://pot/'.length))
    return isAddress(potPda) ? { kind: 'pot', potPda } : null
  }

  let candidate: string | null = null
  if (text.startsWith('envelope://pay/')) candidate = firstPathSegment(text.slice('envelope://pay/'.length))
  else if (text.startsWith('solana:')) candidate = firstPathSegment(text.slice('solana:'.length))
  else {
    const tip = /^https?:\/\/[^/?#]+\/tip\/([^/?#]+)/.exec(text)
    if (tip) candidate = tip[1]!
  }

  if (!candidate || !isAddress(candidate)) return null
  // Solana Pay's own query (amount, spl-token…) isn't ours; only Envelope codes carry `assets`.
  const assets = text.startsWith('solana:') ? undefined : assetsParam(text)
  return { kind: 'recipient', address: candidate, ...(assets ? { assets } : {}) }
}
