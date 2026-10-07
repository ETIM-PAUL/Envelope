import {
  createDefaultRpcTransport,
  createSolanaRpcFromTransport,
  createSolanaRpcSubscriptions,
  isSolanaError,
  SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR,
  type RpcTransport,
} from '@solana/kit'
import 'dotenv/config'

export function getDevnetRpcUrl(): string {
  return process.env.HELIUS_DEVNET_RPC_URL ?? 'https://api.devnet.solana.com'
}

// The public devnet endpoint answers bursts (a confidential transfer's proof transactions, back
// to back) with HTTP 429. A 429 means the request was refused, not processed, so retrying it —
// even a sendTransaction — is safe. Backs off 1s, 2s, 4s… up to six times.
const MAX_RATE_LIMIT_RETRIES = 6

function withRateLimitRetry(transport: RpcTransport): RpcTransport {
  return async <TResponse>(request: Parameters<RpcTransport>[0]): Promise<TResponse> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await transport<TResponse>(request)
      } catch (error) {
        const rateLimited =
          isSolanaError(error, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR) && error.context.statusCode === 429
        if (!rateLimited || attempt >= MAX_RATE_LIMIT_RETRIES) throw error
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt))
      }
    }
  }
}

export function createDevnetClients() {
  const rpcUrl = getDevnetRpcUrl()
  const rpc = createSolanaRpcFromTransport(withRateLimitRetry(createDefaultRpcTransport({ url: rpcUrl })))
  const rpcSubscriptions = createSolanaRpcSubscriptions(rpcUrl.replace(/^http/, 'ws'))
  return { rpc, rpcSubscriptions }
}
