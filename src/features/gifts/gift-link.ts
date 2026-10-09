// A gift link's secret: 32 random bytes, base58 (see packages/cbridge/src/protocol.ts's
// CreateGiftParams). Checked before anything tries to open a gift.
const GIFT_SECRET = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export function isGiftSecret(value: string | undefined): value is string {
  return Boolean(value && GIFT_SECRET.test(value))
}
