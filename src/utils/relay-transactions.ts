// Phase 13: POSTs the partially-signed transactions buildTransferPlan returns (owner signed, the
// relayer's own fee-payer slot deliberately left empty — see packages/cbridge/src/protocol.ts's
// BuildTransferPlanParams) to the relayer's /relay endpoint, which validates, co-signs, and
// submits them in order. Unlike sendSignedTransactions, this app never submits these itself — a
// confidential transfer's fee payer is the relayer, not the connected wallet.
import { RELAYER_URL } from '../config/relayer'

type RelaySuccess = { signatures: string[] }
type RelayFailure = { error: string }

export async function relayTransactions(owner: string, transactions: string[]): Promise<string[]> {
  const response = await fetch(`${RELAYER_URL}/relay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ owner, transactions }),
  })
  const body = (await response.json().catch(() => null)) as RelaySuccess | RelayFailure | null
  if (!response.ok || !body || 'error' in body) {
    throw new Error(body && 'error' in body ? body.error : `relay failed with status ${response.status}`)
  }
  return body.signatures
}
