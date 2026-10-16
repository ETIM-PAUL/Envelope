// A gift link's secret: 32 random bytes, base58 (see packages/cbridge/src/protocol.ts's
// CreateGiftParams). Checked before anything tries to open a gift.
const GIFT_SECRET = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export function isGiftSecret(value: string | undefined): value is string {
  return Boolean(value && GIFT_SECRET.test(value))
}

// A gift's message rides in the link next to the secret — `#<secret>.<message>`, or `&m=<message>`
// in the app link — never on-chain and never on a server (browsers don't send what follows `#`).
// So it's exactly as private as the gift: whoever holds the link can read it. Base64url keeps the
// link one unbroken word whatever the message contains; '.' can't occur in base58 or base64url.
export const GIFT_MESSAGE_MAX = 120
const ENCODED_MESSAGE = /^[A-Za-z0-9_-]{1,640}$/ // 120 code points of up to 4 bytes, in base64

export function cleanGiftMessage(message: string): string {
  // One line, no control characters, at most GIFT_MESSAGE_MAX characters (code points, so an
  // emoji is never cut in half).
  const oneLine = message
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return Array.from(oneLine).slice(0, GIFT_MESSAGE_MAX).join('')
}

export function encodeGiftMessage(message: string): string {
  return Buffer.from(cleanGiftMessage(message), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// Whatever a link carries is someone else's text: anything malformed reads as no message.
export function decodeGiftMessage(encoded: string | undefined): string | null {
  if (!encoded || !ENCODED_MESSAGE.test(encoded)) return null
  const text = Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  if (text.includes('�')) return null // not valid UTF-8
  return cleanGiftMessage(text) || null
}

// The part of a web gift link after '#': the secret, then the message if there is one.
export function splitGiftFragment(fragment: string): { secret: string; encodedMessage?: string } {
  const [secret = '', encodedMessage] = fragment.split('.')
  return encodedMessage ? { secret, encodedMessage } : { secret }
}
