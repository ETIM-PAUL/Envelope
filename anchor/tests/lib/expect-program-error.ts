import { expect } from 'vitest'

// Anchor's ConstraintSeeds: an account's address doesn't match the PDA its `seeds` constraint
// derives (anchor-lang's ErrorCode::ConstraintSeeds).
export const CONSTRAINT_SEEDS = 2006

// Asserts that `promise` rejects with a specific program error code, not just any failure.
// Kit wraps a failed preflight in nested SolanaErrors: the custom code sits in some `cause`'s
// `context.code`, and the program logs ("Error Number: 2006") in the preflight error's context.
export async function expectProgramError(promise: Promise<unknown>, code: number) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error, `expected program error ${code}, but the transaction succeeded`).toBeDefined()
  const codes: number[] = []
  const logs: string[] = []
  for (let e = error as { context?: { code?: unknown; logs?: unknown }; cause?: unknown } | undefined; e;) {
    if (typeof e.context?.code === 'number') codes.push(e.context.code)
    if (Array.isArray(e.context?.logs)) logs.push(...(e.context.logs as string[]))
    e = e.cause as typeof e
  }
  const found = codes.includes(code) || logs.some((line) => line.includes(`Error Number: ${code}.`))
  expect(found, `expected program error ${code}; got codes [${codes}] and logs:\n${logs.join('\n')}`).toBe(true)
}
