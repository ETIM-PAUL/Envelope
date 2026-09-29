// Phase 7: config loader for `config/devnet.json` (program IDs, mint addresses, the demo wallet
// set used by the CLI scripts). Devnet-only for this build — see `<DevnetBadge>`.
import devnetConfig from '../../config/devnet.json'

export type DevnetConfig = {
  cluster: 'devnet'
  wallets: Record<string, string>
  mints?: { usdc: string; skr: string; cusdc: string }
  programs?: { envelope_stake: string; envelope_vault: string }
  accounts?: { envelope_stake_pool: string; envelope_vault_config: string; envelope_vault_authority: string }
}

export function getDevnetConfig(): DevnetConfig {
  return devnetConfig as DevnetConfig
}

export function requireMints(): NonNullable<DevnetConfig['mints']> {
  const { mints } = getDevnetConfig()
  if (!mints) {
    throw new Error('config/devnet.json has no `mints` — run `npm run devnet:mints` first')
  }
  return mints
}

export function requirePrograms(): NonNullable<DevnetConfig['programs']> {
  const { programs } = getDevnetConfig()
  if (!programs) {
    throw new Error('config/devnet.json has no `programs` — run `npm run devnet:vault-roundtrip` first')
  }
  return programs
}
