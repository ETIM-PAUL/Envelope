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
  type SignTransactionParams,
  type SignTransactionResult,
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
  onSignTransaction: (address: string, messageBytes: Uint8Array) => Promise<Uint8Array>
  onReady?: () => void
}

// Hermes has no global atob/btoa — react-native-quick-base64 (already a project dependency) does
// the same job as a native module.
const base64ToBytes = (base64: string): Uint8Array => toByteArray(base64)
const bytesToBase64 = (bytes: Uint8Array): string => fromByteArray(bytes)

// Mount exactly once at the app root. Renders a zero-size, locked-down WebView that loads only
// the inlined cbridge HTML bundle — no remote scripts, no navigation, no file access.
export function CBridgeHost({ children, onSignMessage, onSignTransaction, onReady }: CBridgeHostProps) {
  const webviewRef = useRef<WebView>(null)
  const [ready, setReady] = useState(false)
  const channel = useMemo(() => {
    const rpcChannel = new RpcChannel((text) => webviewRef.current?.postMessage(text), 'host')

    rpcChannel.on('signMessage', async (params) => {
      const { address, messageBase64 } = params as SignMessageParams
      const signature = await onSignMessage(address, base64ToBytes(messageBase64))
      return { signatureBase64: bytesToBase64(signature) } satisfies SignMessageResult
    })

    rpcChannel.on('signTransaction', async (params) => {
      const { address, messageBase64 } = params as SignTransactionParams
      const signature = await onSignTransaction(address, base64ToBytes(messageBase64))
      return { signatureBase64: bytesToBase64(signature) } satisfies SignTransactionResult
    })

    return rpcChannel
    // eslint-disable-next-line react-hooks/exhaustive-deps -- channel identity must stay stable
  }, [])

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      void channel.receive(event.nativeEvent.data)
    },
    [channel],
  )

  const handleLoadEnd = useCallback(async () => {
    // First real round trip through the WASM-backed bridge — confirms it initialized, not just
    // that the page loaded.
    const { wasmReady } = await channel.call<BridgeMethodMap['ping']['result']>('ping', {})
    if (wasmReady) {
      setReady(true)
      onReady?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onReady intentionally not tracked
  }, [channel])

  const api = useMemo<CBridgeApi>(
    () => ({
      ready,
      call: (method, params) => channel.call(method, params),
    }),
    [ready, channel],
  )

  return (
    <CBridgeContext.Provider value={api}>
      {children}
      <View style={styles.hidden} pointerEvents="none">
        <WebViewComponent
          ref={webviewRef}
          source={{ html: BRIDGE_HTML, baseUrl: 'about:blank' }}
          originWhitelist={['about:blank']}
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
