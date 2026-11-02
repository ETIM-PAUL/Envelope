// A statement travels as a link to the verify page, the statement itself after the `#` (base64url
// JSON, the format packages/cbridge/src/statement.ts's decodeStatement reads). Like a gift link's
// secret, a fragment is never sent to a server.
import type { Statement } from '@envelope/cbridge'
import { STATEMENT_VERIFY_URL } from '../../config/site'

export function encodeStatement(statement: Statement): string {
  return Buffer.from(JSON.stringify(statement), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function statementLink(statement: Statement): string {
  return `${STATEMENT_VERIFY_URL}#${encodeStatement(statement)}`
}
