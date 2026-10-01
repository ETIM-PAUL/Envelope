// Phase 14: the static tip-link site (`https://<site>/tip/<owner>`, a page that deep-links into
// the app with an install fallback for anyone who doesn't have it yet). That site isn't part of
// this repo — it needs its own tiny static page hosted somewhere — so this is a placeholder
// pointing at nothing real yet. Until it's deployed, the tip link in the Receive screen just
// won't resolve for someone without the app installed; the `envelope://` QR code works regardless
// since it only needs the app already installed, not a web fallback.
export const TIP_SITE_URL = process.env.EXPO_PUBLIC_TIP_SITE_URL || 'https://envelope.example/tip'
