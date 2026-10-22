// A web link Android hands to the app once it has verified the relayer's host (app.config.ts):
// `https://<relayer>/gift#<secret>[.<message>]` and `https://<relayer>/tip/<address>[?assets=…]`.
// Maps each to the screen the same link reaches through its `envelope://` form, so tapping a link
// in a chat opens the claim or pay screen directly instead of the web page. Anything else (the
// `envelope://` links themselves, expo-router paths) is none of its business.
import { isAddress } from '@solana/kit'
import { splitGiftFragment } from '../features/gifts/gift-link'
import { queryParam } from './parse-scanned-code'

const WEB_LINK = /^https?:\/\/[^/?#]+(\/[^?#]*)?(\?[^#]*)?(?:#(.*))?$/

export function routeForAppLink(url: string): string | null {
  const match = WEB_LINK.exec(url.trim())
  if (!match) return null
  const [, path = '', query = '', fragment = ''] = match

  if (path === '/gift' || path === '/gift/') {
    const { secret, encodedMessage } = splitGiftFragment(fragment)
    // The claim screen says so when the secret isn't one, so an incomplete link still lands there.
    return `/gift?k=${encodeURIComponent(secret)}${encodedMessage ? `&m=${encodeURIComponent(encodedMessage)}` : ''}`
  }

  const tip = /^\/tip\/([^/]+)\/?$/.exec(path)
  if (tip) {
    const owner = decodeURIComponent(tip[1]!)
    if (!isAddress(owner)) return null
    const assets = queryParam(query, 'assets')
    return `/pay/${owner}${assets ? `?assets=${encodeURIComponent(assets)}` : ''}`
  }

  return null
}
