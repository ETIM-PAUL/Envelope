// Selective disclosure: the bridge proves the chosen figures against their on-chain ciphertexts
// (buildStatement); the result goes out as a link anyone can check. No key leaves the phone.
import { useCBridge } from '@envelope/rn-confidential'
import type { Statement } from '@envelope/cbridge'
import { useCallback, useState } from 'react'
import { getAsset, type AssetId } from '../../config/assets'
import { DEVNET_RPC_URL } from '../../config/rpc'
import { useAppStore } from '../../store/app-store'
import { statementLink } from './statement-link'

export type TransferChoice = { signature: string; index: number }

export function useCreateStatement() {
  const bridge = useCBridge()
  const walletAddress = useAppStore((s) => s.walletAddress)
  const [isBusy, setIsBusy] = useState(false)

  const createStatement = useCallback(
    async (
      asset: AssetId,
      includeBalance: boolean,
      transfers: TransferChoice[],
    ): Promise<{ statement: Statement; link: string }> => {
      if (!walletAddress) throw new Error('connect a wallet first')
      if (!bridge.ready) throw new Error('confidential bridge is not ready yet')
      setIsBusy(true)
      try {
        const { statement } = await bridge.call('buildStatement', {
          rpcUrl: DEVNET_RPC_URL,
          cluster: 'devnet',
          mint: getAsset(asset).confidentialMint,
          owner: walletAddress,
          includeBalance,
          transfers,
        })
        return { statement, link: statementLink(statement) }
      } finally {
        setIsBusy(false)
      }
    },
    [bridge, walletAddress],
  )

  return { createStatement, isBusy }
}
