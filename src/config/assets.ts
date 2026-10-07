// The tokens Envelope can hold privately: dollars (USDC <-> cUSDC, the vault's original pair) and
// SKR (SKR <-> cSKR, an `AssetVault` — see anchor/programs/envelope_vault/src/state.rs). Every
// hook that touches a confidential balance takes an `AssetId` (default 'usdc'), so screens pick
// a token once and everything below them follows. Both are 6 decimals.
import { formatBaseUnits } from '../utils/format-amount'
import { requireMints } from './devnet-config'

export type AssetId = 'usdc' | 'skr'

export type Asset = {
  id: AssetId
  /** The public token the wallet holds and gets back on withdraw. */
  symbol: string
  /** The confidential token Envelope holds privately. */
  privateSymbol: string
  decimals: number
  underlyingMint: string
  confidentialMint: string
}

export const ASSET_DECIMALS = 6

/** What people call each token in the UI. Doesn't need the mints, so it's safe anywhere. */
export function assetLabel(id: AssetId): string {
  return id === 'usdc' ? 'Dollars' : 'SKR'
}

/** The order tokens are listed in, everywhere. */
export const ASSET_IDS: readonly AssetId[] = ['usdc', 'skr']

export function getAsset(id: AssetId): Asset {
  const mints = requireMints()
  if (id === 'usdc') {
    return {
      id,
      symbol: 'USDC',
      privateSymbol: 'cUSDC',
      decimals: ASSET_DECIMALS,
      underlyingMint: mints.usdc,
      confidentialMint: mints.cusdc,
    }
  }
  if (!mints.cskr) throw new Error('config/devnet.json has no `mints.cskr` — run `npm run devnet:cskr` first')
  return {
    id,
    symbol: 'SKR',
    privateSymbol: 'cSKR',
    decimals: ASSET_DECIMALS,
    underlyingMint: mints.skr,
    confidentialMint: mints.cskr,
  }
}

/** Tokens this deployment supports (cSKR only once `npm run devnet:cskr` has run). */
export function availableAssetIds(): AssetId[] {
  return requireMints().cskr ? [...ASSET_IDS] : ['usdc']
}

export function assetForConfidentialMint(mint: string): AssetId | null {
  return availableAssetIds().find((id) => getAsset(id).confidentialMint === mint) ?? null
}

/** "$12.50" for dollars, "250 SKR" for SKR. */
export function formatAssetAmount(amount: bigint, id: AssetId): string {
  const value = formatBaseUnits(amount, ASSET_DECIMALS)
  return id === 'usdc' ? `$${value}` : `${value} SKR`
}

/** Parses the `assets` query value in QR codes and links ("usdc,skr"); unknown ids are dropped. */
export function parseAssetList(value: string | null | undefined): AssetId[] | null {
  if (!value) return null
  const ids = value.split(',').filter((id): id is AssetId => (ASSET_IDS as readonly string[]).includes(id))
  return ids.length > 0 ? ids : null
}
