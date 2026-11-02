import { STATEMENT_KIND, STATEMENT_VERSION, type Statement } from '@envelope/cbridge'
import { describe, expect, it, vi } from 'vitest'
import { decodeStatement, statementShapeError } from '../../../packages/cbridge/src/statement'
import { statementLink } from './statement-link'

// The relayer config reads React Native's Platform, which doesn't load under Vitest.
vi.mock('../../config/relayer', () => ({ RELAYER_URL: 'https://relayer.test' }))

const STATEMENT: Statement = {
  kind: STATEMENT_KIND,
  v: STATEMENT_VERSION,
  cluster: 'devnet',
  createdAt: 1_793_000_000_000,
  owner: '4EGWzCRVbsj3yGpNAEswZf3GELB3ivzBAHg6y9kKaRha',
  mint: '2682Tp4wUvDPR3hkNPirinSUNLVYhytS7mZGzgSNRXUU',
  balance: { amount: '24000000', proof: 'AAEC+/8=' },
  transfers: [
    {
      signature: '3js852BcaMFbvDgRAhszZdKU3KuSKnrAR9JZH6EcD6d4NHbq3TKNw9LhA1pghBYCqPU29z2TfuHxqupr8k7MxEZS',
      index: 1,
      amount: '5000000',
      lo: 'lo+/proof==',
      hi: 'hi/+proof=',
    },
  ],
}

describe('statement links', () => {
  it('reads back on the verify page exactly as the app wrote it', () => {
    const link = statementLink(STATEMENT)
    const [page, fragment] = link.split('#')
    expect(page).toBe('https://etim-paul.github.io/Envelope/verify.html')
    expect(fragment).toMatch(/^[A-Za-z0-9_-]+$/)
    const decoded = decodeStatement(fragment!)
    expect(decoded).toEqual(STATEMENT)
    expect(statementShapeError(decoded)).toBeNull()
  })

  it('refuses things that are not statements', () => {
    expect(statementShapeError({})).not.toBeNull()
    expect(statementShapeError({ ...STATEMENT, balance: undefined, transfers: [] })).toBe('the statement is empty')
    expect(statementShapeError({ ...STATEMENT, owner: '<script>' })).not.toBeNull()
    const tooMany = Array.from({ length: 11 }, () => STATEMENT.transfers![0]!)
    expect(statementShapeError({ ...STATEMENT, transfers: tooMany })).toBe('too many transfers')
  })
})
