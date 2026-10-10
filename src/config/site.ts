// Tip links and pot invites (`<site>/tip/<address>`): a page that opens the app on that address,
// with a download for anyone who doesn't have it yet. The relayer serves it (relayer/src/tip-page.ts),
// the same way it serves gift links. The `envelope://` QR codes work regardless; they only need the
// app already installed.
import { RELAYER_URL } from './relayer'

export const TIP_SITE_URL = process.env.EXPO_PUBLIC_TIP_SITE_URL || `${RELAYER_URL}/tip`

// Gift links (features/gifts): `<GIFT_LINK_BASE>#<secret>`. The relayer serves that page — it
// explains the gift, offers the app, and opens it — and the secret rides after the `#`, which
// browsers never send to any server. `envelope://gift?k=<secret>` opens the claim screen directly.
export const GIFT_LINK_BASE = process.env.EXPO_PUBLIC_GIFT_SITE_URL || `${RELAYER_URL}/gift`

export function giftLink(secret: string): string {
  return `${GIFT_LINK_BASE}#${secret}`
}
