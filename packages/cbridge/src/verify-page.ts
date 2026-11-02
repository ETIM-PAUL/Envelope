// The statement verify page (docs/verify.html, built by build.ts): checks an Envelope statement
// against Solana in the browser. The statement arrives after the `#` of the link, so it never
// reaches a server; the only network traffic is reads of public chain data from an RPC node.
// Everything taken from the statement is shown as text (textContent), never as HTML.
import zkInit from '@solana/zk-sdk/web'
import { createSolanaRpc } from '@solana/kit'
import { ZK_SDK_WASM_BASE64 } from './generated/wasmBase64.ts'
import { decodeStatement, verifyStatement, type Statement, type StatementReport } from './statement.ts'

declare const KNOWN_MINTS: Record<string, { name: string; unit: string }> // injected by build.ts from config/devnet.json

const RPC_URLS: Record<Statement['cluster'], string> = {
  devnet: 'https://api.devnet.solana.com',
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
}

const $ = (id: string) => document.getElementById(id)!

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function short(value: string): string {
  return value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value
}

function explorer(kind: 'address' | 'tx', value: string, cluster: string): string {
  const query = cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`
  return `https://explorer.solana.com/${kind}/${value}${query}`
}

function link(text: string, href: string): HTMLElement {
  const a = el('a', 'mono', text) as HTMLAnchorElement
  a.href = href
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  return a
}

function formatAmount(amount: string, decimals: number | null): string {
  if (decimals === null) return amount
  const value = BigInt(amount)
  const scale = 10n ** BigInt(decimals)
  const whole = (value / scale).toLocaleString('en-US')
  const fraction = (value % scale).toString().padStart(decimals, '0').replace(/0+$/, '').padEnd(2, '0')
  return `${whole}.${fraction}`
}

const STATUS_TEXT = { proven: 'Proven', changed: 'Out of date', invalid: 'Not proven' } as const

function badge(status: keyof typeof STATUS_TEXT): HTMLElement {
  return el('span', `badge ${status}`, STATUS_TEXT[status])
}

function render(statement: Statement, report: StatementReport) {
  const out = $('result')
  out.replaceChildren()
  const known = KNOWN_MINTS[statement.mint]
  const unit = known?.unit ?? ''
  const amount = (value: string) => `${formatAmount(value, report.decimals)}${unit ? ` ${unit}` : ''}`

  // Out of date isn't wrong: the balance was proven once, the account has simply moved on since.
  const statuses = [report.balance?.status, ...report.transfers.map((t) => t.status)]
  const [tone, title, body] = report.error
    ? ['invalid', "This statement couldn't be checked", report.error]
    : statuses.includes('invalid')
      ? [
          'invalid',
          "Some figures don't check out",
          'Only the figures marked Proven can be relied on. The reasons are listed with each one.',
        ]
      : statuses.includes('changed')
        ? [
            'changed',
            'Checked, with the balance out of date',
            'The balance has changed since this statement was made, so it can no longer be checked. Everything else is proven.',
          ]
        : ['proven', 'Every figure checks out', `Each amount below is proven against Solana ${statement.cluster}.`]
  const banner = el('div', `banner ${tone}`)
  banner.append(el('strong', undefined, title), el('p', undefined, body))
  out.append(banner)

  const meta = el('dl', 'meta')
  const row = (label: string, value: Node | string) => {
    meta.append(el('dt', undefined, label))
    const dd = el('dd')
    dd.append(value)
    meta.append(dd)
  }
  row('Wallet', link(statement.owner, explorer('address', statement.owner, statement.cluster)))
  const tokenValue = el('span')
  tokenValue.append(
    `${known?.name ?? 'Unknown token'} · `,
    link(short(statement.mint), explorer('address', statement.mint, statement.cluster)),
  )
  row('Token', tokenValue)
  row('Made', `${new Date(statement.createdAt).toLocaleString()} (as the phone's clock saw it)`)
  out.append(meta)
  if (report.error) return

  if (report.balance) {
    const section = el('section', 'card')
    section.append(el('h2', undefined, 'Balance'))
    const line = el('div', 'line')
    line.append(el('span', 'amount', amount(report.balance.amount)), badge(report.balance.status))
    section.append(line)
    if (report.balance.reason) section.append(el('p', 'reason', report.balance.reason))
    if (report.pendingCredits) {
      section.append(el('p', 'note', 'The account also has incoming funds not yet added to this balance.'))
    }
    out.append(section)
  }

  if (report.transfers.length > 0) {
    const section = el('section', 'card')
    section.append(el('h2', undefined, 'Transfers'))
    for (const t of report.transfers) {
      const item = el('div', 'transfer')
      const top = el('div', 'line')
      const sign = t.direction === 'incoming' ? '+' : t.direction === 'outgoing' ? '−' : ''
      top.append(el('span', 'amount', `${sign}${amount(t.amount)}`), badge(t.status))
      item.append(top)
      const details = el('p', 'details')
      if (t.blockTime) details.append(`${new Date(t.blockTime * 1000).toLocaleString()} · `)
      if (t.direction && t.counterparty) {
        details.append(t.direction === 'incoming' ? 'from ' : 'to ')
        details.append(link(short(t.counterparty), explorer('address', t.counterparty, statement.cluster)), ' · ')
      }
      details.append(link('transaction', explorer('tx', t.signature, statement.cluster)))
      item.append(details)
      if (t.reason) item.append(el('p', 'reason', t.reason))
      section.append(item)
    }
    out.append(section)
  }
}

async function check(encoded: string) {
  const status = $('status')
  $('result').replaceChildren()
  status.textContent = 'Checking against Solana…'
  let statement: Statement
  try {
    statement = decodeStatement(encoded.trim()) as Statement
  } catch {
    status.textContent = "That isn't an Envelope statement link."
    return
  }
  const override = new URLSearchParams(location.search).get('rpc')
  const rpcUrl = override || RPC_URLS[statement.cluster] || RPC_URLS.devnet
  try {
    await wasmReady
    const report = await verifyStatement(createSolanaRpc(rpcUrl), statement)
    status.textContent = ''
    render(statement, report)
  } catch (e) {
    status.textContent = `Couldn't reach Solana (${e instanceof Error ? e.message : String(e)}). Try again in a moment.`
  }
}

function fromInput(text: string): string {
  const value = text.trim()
  const hash = value.indexOf('#')
  return hash >= 0 ? value.slice(hash + 1) : value
}

const wasmReady = zkInit({
  module_or_path: Uint8Array.from(atob(ZK_SDK_WASM_BASE64), (c) => c.charCodeAt(0)),
})

$('form').addEventListener('submit', (event) => {
  event.preventDefault()
  const value = fromInput(($('input') as HTMLTextAreaElement).value)
  if (value) {
    history.replaceState(null, '', `#${value}`)
    void check(value)
  }
})

// A link with a statement opens straight to the result; the paste box is for checking another.
if (location.hash.length > 1) {
  $('form').hidden = true
  $('another').hidden = false
  void check(location.hash.slice(1))
}
$('another').addEventListener('click', () => {
  $('form').hidden = false
  $('another').hidden = true
  ;($('input') as HTMLTextAreaElement).focus()
})
