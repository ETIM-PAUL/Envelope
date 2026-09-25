import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit'
import 'dotenv/config'

export function getDevnetRpcUrl(): string {
  return process.env.HELIUS_DEVNET_RPC_URL ?? 'https://api.devnet.solana.com'
}

export function createDevnetClients() {
  const rpcUrl = getDevnetRpcUrl()
  const rpc = createSolanaRpc(rpcUrl)
  const rpcSubscriptions = createSolanaRpcSubscriptions(rpcUrl.replace(/^http/, 'ws'))
  return { rpc, rpcSubscriptions }
}
