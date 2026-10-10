// GET /tip/:address — the page a tip or pot invite link opens (`<relayer>/tip/<address>`, from
// Receive's "Share" and a pot's "Share invite link"). The address is public (it's in the path), so
// the server validates it and builds the app link itself: "Open in Envelope" lands on the pay
// screen for that address, and anyone without the app gets the download.
import { APP_PACKAGE, linkPage } from './link-page.ts'

const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export function isTipAddress(value: string): boolean {
  return BASE58_ADDRESS.test(value)
}

export function tipPage(address: string, assets: string | undefined, appDownloadUrl: string): string {
  const query = assets && /^[a-z,]{1,20}$/.test(assets) ? `?assets=${assets}` : ''
  const appPath = `pay/${address}${query}`
  const download = JSON.stringify(appDownloadUrl)
  const intent = JSON.stringify(
    `intent://${appPath}#Intent;scheme=envelope;package=${APP_PACKAGE};S.browser_fallback_url=${encodeURIComponent(appDownloadUrl)};end`,
  )
  return linkPage({
    title: 'Send a private payment on Envelope',
    body: `  <h1>Send a private payment</h1>
  <p>Envelope is a private payments app on Solana: only you and the person you pay ever see the amount.</p>
  <ol>
    <li>Install Envelope (Android).</li>
    <li>Come back to this page and tap <strong>Open in Envelope</strong>.</li>
    <li>Pick an amount and confirm with your fingerprint.</li>
  </ol>
  <a id="open" class="button primary" href="#">Open in Envelope</a>
  <a id="get" class="button secondary" href="#">Get Envelope for Android</a>
  <p class="note">Paying ${address.slice(0, 4)}…${address.slice(-4)}</p>`,
    script: `  (function () {
    var download = ${download};
    document.getElementById('get').href = download;
    document.getElementById('open').href = /Android/i.test(navigator.userAgent)
      ? ${intent}
      : 'envelope://${appPath}';
  })();`,
  })
}
