import { isRpcCall, type RpcCall, type RpcMessage, type RpcResponse } from './protocol.ts'

export type Handler = (params: unknown) => Promise<unknown>

// A duplex JSON-RPC channel over a single text-message pipe (`postMessage`). Used identically on
// both sides of the bridge: the WebView side sends via `window.ReactNativeWebView.postMessage`
// and receives via a `message` event listener; the React Native side sends via the WebView ref's
// `injectJavaScript`/`postMessage` and receives via the `onMessage` prop. Each instance tracks
// only the calls *it* made — a message the other side didn't ask for and doesn't recognize the id
// of falls through silently rather than crashing the channel.
export class RpcChannel {
  private nextId = 0
  private readonly pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private readonly handlers = new Map<string, Handler>()

  constructor(
    private readonly send: (text: string) => void,
    private readonly idPrefix: string,
  ) {}

  on(method: string, handler: Handler): void {
    this.handlers.set(method, handler)
  }

  call<TResult = unknown>(method: string, params: unknown): Promise<TResult> {
    const id = `${this.idPrefix}-${this.nextId++}`
    const promise = new Promise<TResult>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
    })
    const call: RpcCall = { id, method, params }
    this.send(JSON.stringify(call))
    return promise
  }

  async receive(text: string): Promise<void> {
    let message: RpcMessage
    try {
      message = JSON.parse(text) as RpcMessage
    } catch {
      return
    }

    if (isRpcCall(message)) {
      const handler = this.handlers.get(message.method)
      if (!handler) {
        const response: RpcResponse = { id: message.id, error: `no handler for method "${message.method}"` }
        this.send(JSON.stringify(response))
        return
      }
      try {
        const result = await handler(message.params)
        const response: RpcResponse = { id: message.id, result }
        this.send(JSON.stringify(response))
      } catch (err) {
        const response: RpcResponse = { id: message.id, error: err instanceof Error ? err.message : String(err) }
        this.send(JSON.stringify(response))
      }
      return
    }

    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    if ('error' in message) {
      pending.reject(new Error(message.error))
    } else {
      pending.resolve(message.result)
    }
  }
}
