// GET /gift — the page a gift link opens (`<relayer>/gift#<secret>`; see the app's
// features/gifts). It tells the recipient what they've got and how to claim it: install Envelope,
// then open the gift in it. The secret, and the sender's message if there is one
// (`#<secret>.<message>`, the app's features/gifts/gift-link.ts), stay after the `#`, which browsers
// never send, so this server never sees either: the page's own script reads them and builds the app
// link. The message is shown as plain text only.
import { APP_PACKAGE, linkPage } from './link-page.ts'

export function giftPage(appDownloadUrl: string): string {
  const download = JSON.stringify(appDownloadUrl)
  return linkPage({
    title: 'A private gift on Envelope',
    body: `  <section id="gift">
    <h1>You've been sent a private gift</h1>
    <p>Someone sent you money on Envelope, a private payments app on Solana. Only you will see how much.</p>
    <p id="message" class="message hidden"></p>
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
    // Base58 and base64url never need percent-encoding; a link that has it is mangled.
    var fragment = location.hash.slice(1).split('.');
    var secret = fragment[0] || '';
    var message = decodeMessage(fragment[1]);
    var download = ${download};
    document.getElementById('get').href = download;
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(secret)) {
      document.getElementById('gift').className = 'hidden';
      document.getElementById('broken').className = '';
      return;
    }
    var query = 'k=' + secret + (message ? '&m=' + fragment[1] : '');
    if (message) {
      var shown = document.getElementById('message');
      shown.textContent = '\\u201c' + message + '\\u201d';
      shown.className = 'message';
    }
    var appLink = 'envelope://gift?' + query;
    // On Android an intent link opens the app if it's installed and falls back to the download.
    var isAndroid = /Android/i.test(navigator.userAgent);
    document.getElementById('open').href = isAndroid
      ? 'intent://gift?' + query + '#Intent;scheme=envelope;package=${APP_PACKAGE};S.browser_fallback_url=' +
        encodeURIComponent(download) + ';end'
      : appLink;

    // Same rules as the app's decodeGiftMessage: base64url UTF-8, one line, 120 characters at most;
    // anything malformed reads as no message.
    function decodeMessage(encoded) {
      if (!encoded || !/^[A-Za-z0-9_-]{1,640}$/.test(encoded)) return null;
      try {
        var binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        var text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        text = text.replace(/[\\u0000-\\u001f\\u007f]+/g, ' ').replace(/\\s+/g, ' ').trim();
        return Array.from(text).slice(0, 120).join('') || null;
      } catch (e) {
        return null;
      }
    }
  })();`,
  })
}
