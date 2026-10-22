// GET /.well-known/assetlinks.json: what lets Android verify that Envelope owns this host's gift
// and tip links, so tapping one opens the app directly (the app's intent filters: app.config.ts).
// Android fetches it over https, once, when the app is installed, and compares the app's signing
// certificate with the fingerprints listed here, so a different app can't claim these links. It
// has to be served as is: no redirect, no auth.
import { APP_PACKAGE } from './link-page.ts'

// SHA-256 of the key that signs the release APK (`keytool -printcert -jarfile envelope.apk`). The
// same key signs every update, the Solana dApp Store's included. APP_CERT_SHA256 replaces it,
// comma-separated, for another signing key or a second one (a test build's, say).
const RELEASE_CERT_SHA256 =
  '47:B0:F0:19:17:9D:A9:A6:22:9A:B7:93:51:62:4E:49:37:E6:D1:7B:71:00:B1:D4:62:67:12:CD:30:59:69:E5'

const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/

export function certFingerprints(env: string | undefined): string[] {
  const listed = (env ?? '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)
  const invalid = listed.find((value) => !FINGERPRINT.test(value))
  if (invalid) throw new Error(`APP_CERT_SHA256 has a value that isn't a SHA-256 fingerprint: ${invalid}`)
  return listed.length > 0 ? listed : [RELEASE_CERT_SHA256]
}

export function assetLinks(fingerprints: string[]) {
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: APP_PACKAGE, sha256_cert_fingerprints: fingerprints },
    },
  ]
}
