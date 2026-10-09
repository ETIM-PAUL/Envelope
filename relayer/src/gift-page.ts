// GET /gift — the page a gift link opens (`<relayer>/gift#<secret>`; see the app's
// features/gifts). It tells the recipient what they've got and how to claim it: install Envelope,
// then open the gift in it. The secret stays after the `#`, which browsers never send, so this
// server never sees it: the page's own script reads it and builds the app link.
const APP_PACKAGE = 'com.etimpaul.envelope'

export function giftPage(appDownloadUrl: string): string {
  const download = JSON.stringify(appDownloadUrl)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>A private gift on Envelope</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0F1116; color: #F6F1E7; padding: 24px 16px;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  main { width: 100%; max-width: 380px; text-align: center; }
  .seal {
    width: 72px; height: 72px; margin: 0 auto 24px; border-radius: 50%; background: #C4432E;
    display: flex; align-items: center; justify-content: center; box-shadow: inset 0 0 0 4px #A6371F;
  }
  h1 { font-family: Georgia, "Times New Roman", serif; font-weight: 600; font-size: 28px; line-height: 1.2; margin: 0 0 12px; }
  p { color: #8C93A6; font-size: 16px; line-height: 1.55; margin: 0 0 24px; }
  ol { text-align: left; color: #DCD6C8; font-size: 15px; line-height: 1.6; padding-left: 22px; margin: 0 0 28px; }
  li { margin-bottom: 6px; }
  a.button {
    display: block; padding: 16px 20px; border-radius: 16px; font-weight: 600; font-size: 16px;
    text-decoration: none; margin-bottom: 12px;
  }
  a.primary { background: #C4432E; color: #F6F1E7; }
  a.secondary { background: #232733; color: #F6F1E7; }
  a:focus-visible { outline: 2px solid #C9A227; outline-offset: 3px; }
  .note { font-size: 13px; color: #6B7185; margin-top: 20px; }
  .hidden { display: none; }
</style>
</head>
<body>
<main>
  <div class="seal" aria-hidden="true">
    <svg width="34" height="26" viewBox="0 0 34 26"><path d="M0 0 L17 13 L34 0 V26 H0 Z" fill="#F6F1E7"/></svg>
  </div>
  <section id="gift">
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
  </section>
</main>
<script>
  (function () {
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
  })();
</script>
</body>
</html>`
}
