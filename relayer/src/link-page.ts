// The shared look of the pages Envelope's links open (gift.ts, tip.ts): dark ink, the wax seal, one
// call to open the app and one to get it. Static HTML; nothing here sees a gift's secret.
export const APP_PACKAGE = 'com.etimpaul.envelope'

export function linkPage({ title, body, script }: { title: string; body: string; script: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>${title}</title>
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
${body}
</main>
<script>
${script}
</script>
</body>
</html>`
}
