// The package root only re-exports the lightweight, pure-JS protocol pieces — safe to import
// from React Native (Hermes has no WebAssembly). Never re-export bridge.ts here: it pulls in
// @solana/zk-sdk and @solana-program/token-2022/confidential, which are WASM-backed and only
// meant to run inside the WebView bundle built by build.ts (see dist/bridge-html.ts for that).
export * from './protocol.ts'
export { RpcChannel, type Handler } from './rpcChannel.ts'
