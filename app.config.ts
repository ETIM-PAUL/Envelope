// Extends app.json with Android App Links: a gift or tip link (`https://<relayer>/gift#…`,
// `/tip/<address>`) that's tapped in another app opens Envelope directly, once Android has verified
// the relayer's host serves /.well-known/assetlinks.json naming this app (relayer/src/app-links.ts).
// The host comes from the same EXPO_PUBLIC_RELAYER_URL the app builds its links from, so the two
// can't drift apart. Without an https relayer (a local dev build) there's nothing to verify, so the
// filter is left out and links open the web page as before.
import type { ConfigContext, ExpoConfig } from 'expo/config'

export const APP_LINK_PATHS = ['/gift', '/tip']

export function appLinkFilters(relayerUrl: string | undefined): NonNullable<ExpoConfig['android']>['intentFilters'] {
  let host: string | null = null
  try {
    const url = new URL(relayerUrl ?? '')
    if (url.protocol === 'https:') host = url.host
  } catch {
    // Not a URL: no app links.
  }
  if (!host) return []
  return [
    {
      action: 'VIEW',
      autoVerify: true,
      data: APP_LINK_PATHS.map((pathPrefix) => ({ scheme: 'https', host: host as string, pathPrefix })),
      category: ['BROWSABLE', 'DEFAULT'],
    },
  ]
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    intentFilters: appLinkFilters(process.env.EXPO_PUBLIC_RELAYER_URL),
  },
})
