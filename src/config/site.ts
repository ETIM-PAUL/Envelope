// Phase 14: the static tip-link site (`https://<site>/tip/<owner>`, a page that deep-links into
// the app with an install fallback for anyone who doesn't have it yet). That site isn't part of
// this repo — it needs its own tiny static page hosted somewhere — so this is a placeholder
// pointing at nothing real yet. Until it's deployed, the tip link in the Receive screen just
// won't resolve for someone without the app installed; the `envelope://` QR code works regardless
// since it only needs the app already installed, not a web fallback.
import { RELAYER_URL } from './relayer'

export const TIP_SITE_URL = process.env.EXPO_PUBLIC_TIP_SITE_URL || 'https://envelope.example/tip'

// Gift links (features/gifts): `<GIFT_LINK_BASE>#<secret>`. The relayer serves that page — it
// explains the gift, offers the app, and opens it — and the secret rides after the `#`, which
// browsers never send to any server. `envelope://gift?k=<secret>` opens the claim screen directly.
export const GIFT_LINK_BASE = process.env.EXPO_PUBLIC_GIFT_SITE_URL || `${RELAYER_URL}/gift`

export function giftLink(secret: string): string {
  return `${GIFT_LINK_BASE}#${secret}`
}
