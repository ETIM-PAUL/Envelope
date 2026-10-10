// GET /gift — the page a gift link opens (`<relayer>/gift#<secret>`; see the app's
// features/gifts). It tells the recipient what they've got and how to claim it: install Envelope,
// then open the gift in it. The secret stays after the `#`, which browsers never send, so this
// server never sees it: the page's own script reads it and builds the app link.
import { APP_PACKAGE, linkPage } from './link-page.ts'

export function giftPage(appDownloadUrl: string): string {
  const download = JSON.stringify(appDownloadUrl)
  return linkPage({
    title: 'A private gift on Envelope',
    body: `  <section id="gift">
    <h1>You've been sent a private gift</h1>
    <p>Someone sent you money on Envelope, a private payments app on Solana. Only you will see how much.</p>
    <ol>
      <li>Install Envelope (Android).</li>
      <li>Come back to this page and tap <strong>Open in Envelope</strong>.</li>
      <li>Connect a Solana wallet and claim. You don't need any SOL.</li>
    </ol>
    <a id="open" class="button primary" href="#">Open in Envelope</a>
    <a id="get" class="button secondary" href="#">Get Envelope for Android</a>
    <p class="note">Anyone with this link can claim the gift. Keep it to yourself.</p>
  </section>
  <section id="broken" class="hidden">
    <h1>This gift link isn't complete</h1>
    <p>Ask the sender to share it again, and open the whole link.</p>
  </section>`,
    script: `  (function () {
    var secret = decodeURIComponent(location.hash.slice(1));
    var download = ${download};
    document.getElementById('get').href = download;
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(secret)) {
      document.getElementById('gift').className = 'hidden';
      document.getElementById('broken').className = '';
      return;
    }
    var appLink = 'envelope://gift?k=' + secret;
    // On Android an intent link opens the app if it's installed and falls back to the download.
    var isAndroid = /Android/i.test(navigator.userAgent);
    document.getElementById('open').href = isAndroid
      ? 'intent://gift?k=' + secret + '#Intent;scheme=envelope;package=${APP_PACKAGE};S.browser_fallback_url=' +
        encodeURIComponent(download) + ';end'
      : appLink;
  })();`,
  })
}
