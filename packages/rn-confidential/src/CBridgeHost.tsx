import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import WebView, { type WebViewMessageEvent, type WebViewProps } from 'react-native-webview'
import { fromByteArray, toByteArray } from 'react-native-quick-base64'
import { BRIDGE_HTML } from '@envelope/cbridge/dist/bridge-html'
import {
  RpcChannel,
  type BridgeMethodMap,
  type SignMessageParams,
  type SignMessageResult,
  type SignTransactionsParams,
  type SignTransactionsResult,
} from '@envelope/cbridge'

// react-native-webview@14's `WebView` is `class WebView<P = undefined> extends Component<WebViewProps & P>`.
// Under React 19's stricter JSX prop inference the unspecified generic stays at its `undefined`
// default, collapsing `WebViewProps & undefined` to `never` and rejecting every prop. Recast to
// the standard ref-forwarding shape to sidestep the broken generic default.
const WebViewComponent = WebView as unknown as React.ForwardRefExoticComponent<
  WebViewProps & React.RefAttributes<WebView>
>

export type CBridgeApi = {
  ready: boolean
  // Set when the bridge couldn't start (e.g. a WebView too old to run it), so screens can say so
  // instead of waiting on `ready` forever. Includes the WebView's engine version when known.
  error: string | null
  call<TMethod extends keyof BridgeMethodMap>(
    method: TMethod,
    params: BridgeMethodMap[TMethod]['params'],
  ): Promise<BridgeMethodMap[TMethod]['result']>
}

const CBridgeContext = createContext<CBridgeApi | null>(null)

// Reads the confidential-bridge API mounted by <CBridgeHost>. Throws if called outside one —
// mount CBridgeHost once at the app root (Phase 7) before any screen calls this.
export function useCBridge(): CBridgeApi {
  const api = useContext(CBridgeContext)
  if (!api) throw new Error('useCBridge() called outside <CBridgeHost>')
  return api
}

export type CBridgeHostProps = {
  children: React.ReactNode
  // MWA-backed callbacks the bridge invokes for every signature it needs. Neither the bridge nor
  // this host ever sees a private key — these round-trip to whatever wallet-adapter call the app
  // wires up (Phase 8).
  onSignMessage: (address: string, messageBytes: Uint8Array) => Promise<Uint8Array>
  // Takes and returns whole wire transactions — all of a flow's, in one call, so the wallet shows
  // one approval screen. The wallet may rewrite messages while signing, so the signed
  // transactions it returns (not just their signatures) are what must be used; same order out.
  onSignTransactions: (address: string, transactionsBytes: Uint8Array[]) => Promise<Uint8Array[]>
  onReady?: () => void
}

// Hermes has no global atob/btoa — react-native-quick-base64 (already a project dependency) does
// the same job as a native module.
const base64ToBytes = (base64: string): Uint8Array => toByteArray(base64)
const bytesToBase64 = (bytes: Uint8Array): string => fromByteArray(bytes)

// Startup check: the first ping waits on WASM compilation, which takes a few seconds on a slow
// phone. A ping can also be lost if it lands while the page is still settling, so retry before
// giving up.
const PING_TIMEOUT_MS = 20_000
const PING_ATTEMPTS = 3

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the secure engine did not respond')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err: unknown) => {
        clearTimeout(timer)
        reject(err instanceof Error ? err : new Error(String(err)))
      },
    )
  })
}

function engineVersion(userAgent: string | undefined): string {
  const match = userAgent?.match(/Chrome\/(\d+)/)
  return match ? `WebView engine Chrome ${match[1]}` : 'unknown WebView engine'
}

// Mount exactly once at the app root. Renders a zero-size, locked-down WebView that loads only
// the inlined cbridge HTML bundle — no remote scripts, no navigation, no file access.
export function CBridgeHost({ children, onSignMessage, onSignTransactions, onReady }: CBridgeHostProps) {
  const webviewRef = useRef<WebView>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const userAgentRef = useRef<string | undefined>(undefined)

  // The channel's identity must stay stable for the life of the WebView (recreating it would
  // drop in-flight calls), but `onSignMessage`/`onSignTransactions` change identity on every
  // render where the connected account changes (see useBridgeSigners). Refs, updated every
  // render, let the channel's handlers always call whichever version is current instead of the
  // one captured when the channel was first created — otherwise every call after the first
  // reconnect/account-change closes over a stale `account` and wrongly rejects a real signer.
  const onSignMessageRef = useRef(onSignMessage)
  const onSignTransactionsRef = useRef(onSignTransactions)
  onSignMessageRef.current = onSignMessage
  onSignTransactionsRef.current = onSignTransactions

  const channel = useMemo(() => {
    const rpcChannel = new RpcChannel((text) => webviewRef.current?.postMessage(text), 'host')

    rpcChannel.on('signMessage', async (params) => {
      const { address, messageBase64 } = params as SignMessageParams
      const signature = await onSignMessageRef.current(address, base64ToBytes(messageBase64))
      return { signatureBase64: bytesToBase64(signature) } satisfies SignMessageResult
    })

    rpcChannel.on('signTransactions', async (params) => {
      const { address, transactionsBase64 } = params as SignTransactionsParams
      const signed = await onSignTransactionsRef.current(address, transactionsBase64.map(base64ToBytes))
      return { signedTransactionsBase64: signed.map(bytesToBase64) } satisfies SignTransactionsResult
    })

    return rpcChannel
    // eslint-disable-next-line react-hooks/exhaustive-deps -- channel identity must stay stable; the refs above keep its handlers current
  }, [])

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const text = event.nativeEvent.data
      // Sent once at page start: the engine version, for any error shown later.
      if (text.startsWith('{"bridgeInfo"')) {
        try {
          userAgentRef.current = (JSON.parse(text) as { userAgent?: string }).userAgent
        } catch {
          // malformed report: ignore
        }
        return
      }
      // The bridge page's own startup-failure reports (packages/cbridge/build.ts's PRELUDE) aren't
      // RPC messages. Only the first is kept: it's the root cause, later ones are fallout.
      if (text.startsWith('{"bridgeError"')) {
        try {
          const { bridgeError, userAgent } = JSON.parse(text) as { bridgeError: string; userAgent?: string }
          userAgentRef.current = userAgent
          setError((current) => current ?? `${bridgeError.split('\n')[0]} (${engineVersion(userAgent)})`)
        } catch {
          // malformed report: ignore
        }
        return
      }
      void channel.receive(text)
    },
    [channel],
  )

  const handleLoadEnd = useCallback(async () => {
    // First real round trip through the WASM-backed bridge — confirms it initialized, not just
    // that the page loaded.
    let lastError: unknown = null
    for (let attempt = 0; attempt < PING_ATTEMPTS; attempt++) {
      try {
        const { wasmReady } = await withTimeout(
          channel.call<BridgeMethodMap['ping']['result']>('ping', {}),
          PING_TIMEOUT_MS,
        )
        if (wasmReady) {
          setError(null)
          setReady(true)
          onReady?.()
          return
        }
      } catch (err) {
        lastError = err
      }
    }
    const reason = lastError instanceof Error ? lastError.message : 'the secure engine did not start'
    setError((current) => current ?? `${reason} (${engineVersion(userAgentRef.current)})`)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onReady intentionally not tracked
  }, [channel])

  const api = useMemo<CBridgeApi>(
    () => ({
      ready,
      error: ready ? null : error,
      call: (method, params) => channel.call(method, params),
    }),
    [ready, error, channel],
  )

  return (
    <CBridgeContext.Provider value={api}>
      {children}
      <View style={styles.hidden} pointerEvents="none">
        <WebViewComponent
          ref={webviewRef}
          // `baseUrl: 'about:blank'` makes Android's WebView treat the page as an insecure
          // context (`window.isSecureContext === false`), so `crypto.subtle` is unavailable and
          // @solana/kit's crypto helpers throw SOLANA_ERROR__SUBTLE_CRYPTO__DISALLOWED_IN_INSECURE_CONTEXT.
          // An `https:` baseUrl is treated as secure even though the HTML is injected locally,
          // not fetched — no network request is made, so this fake origin is never dereferenced.
          // Deliberately not `https://localhost` — some RPC providers (confirmed: the public
          // devnet endpoint) 403 any request whose `Origin` header is exactly `https://localhost`
          // as an anti-abuse rule, which otherwise surfaces as an opaque "Failed to fetch".
          source={{ html: BRIDGE_HTML, baseUrl: 'https://envelope.internal/' }}
          originWhitelist={['https://envelope.internal/']}
          onMessage={handleMessage}
          onLoadEnd={handleLoadEnd}
          onShouldStartLoadWithRequest={() => false}
          javaScriptEnabled
          domStorageEnabled={false}
          allowFileAccess={false}
          allowUniversalAccessFromFileURLs={false}
          allowsInlineMediaPlayback={false}
          setSupportMultipleWindows={false}
          mixedContentMode="never"
        />
      </View>
    </CBridgeContext.Provider>
  )
}

const styles = StyleSheet.create({
  hidden: { height: 0, width: 0, overflow: 'hidden' },
})
