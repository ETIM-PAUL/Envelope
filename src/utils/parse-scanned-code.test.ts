import { describe, expect, it } from 'vitest'
import { parseScannedCode } from './parse-scanned-code'

const POT_PDA = '5o6FbFsnSrAduCSRwGt1nTeRfWNSKPvmEq9mkdoFoGTA'
const WALLET = 'J7WZ6cnNBwBKyRjbV3Y4ZQ1LqVYyqs8H8MiZRPSbBbss'
const GIFT_SECRET = '4kdGXt8sLxntuKKEvUcho2KxJruS75M8KREQzF5s7PL'

describe('parseScannedCode', () => {
  it('reads a pot invite QR as a pot', () => {
    expect(parseScannedCode(`envelope://pot/${POT_PDA}`)).toEqual({ kind: 'pot', potPda: POT_PDA })
  })

  it('reads a wallet QR, with the tokens it asks for', () => {
    expect(parseScannedCode(`envelope://pay/${WALLET}?assets=usdc,skr`)).toEqual({
      kind: 'recipient',
      address: WALLET,
      assets: 'usdc,skr',
    })
  })

  it('reads a bare address and a Solana Pay link', () => {
    expect(parseScannedCode(WALLET)).toEqual({ kind: 'recipient', address: WALLET })
    expect(parseScannedCode(`solana:${WALLET}?amount=1`)).toEqual({ kind: 'recipient', address: WALLET })
  })

  it('reads a tip link from the relayer, or from the placeholder site older builds shared', () => {
    for (const base of ['https://envelope-relayer.onrender.com/tip', 'https://envelope.example/tip']) {
      expect(parseScannedCode(`${base}/${WALLET}`)).toEqual({ kind: 'recipient', address: WALLET })
    }
    expect(parseScannedCode(`https://envelope-relayer.onrender.com/tip/${WALLET}?assets=skr`)).toEqual({
      kind: 'recipient',
      address: WALLET,
      assets: 'skr',
    })
  })

  it('reads a gift link in both forms', () => {
    expect(parseScannedCode(`https://envelope-relayer.onrender.com/gift#${GIFT_SECRET}`)).toEqual({
      kind: 'gift',
      secret: GIFT_SECRET,
    })
    expect(parseScannedCode(`envelope://gift?k=${GIFT_SECRET}`)).toEqual({ kind: 'gift', secret: GIFT_SECRET })
  })

  it('rejects anything else', () => {
    for (const text of [
      'hello',
      'envelope://pot/nope',
      'https://example.com/tip/nope',
      `https://example.com/${WALLET}`,
    ]) {
      expect(parseScannedCode(text)).toBeNull()
    }
  })
})
