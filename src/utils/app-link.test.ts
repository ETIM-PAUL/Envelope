import { describe, expect, it } from 'vitest'
import { encodeGiftMessage } from '../features/gifts/gift-link'
import { routeForAppLink } from './app-link'

const HOST = 'https://envelope-relayer.onrender.com'
const SECRET = '4kdGXt8sLxntuKKEvUcho2KxJruS75M8KREQzF5s7PL'
const WALLET = 'J7WZ6cnNBwBKyRjbV3Y4ZQ1LqVYyqs8H8MiZRPSbBbss'

describe('routeForAppLink', () => {
  it('sends a gift link to the claim screen, with its message if it has one', () => {
    expect(routeForAppLink(`${HOST}/gift#${SECRET}`)).toBe(`/gift?k=${SECRET}`)
    const message = encodeGiftMessage('Happy birthday 🎉')
    expect(routeForAppLink(`${HOST}/gift#${SECRET}.${message}`)).toBe(`/gift?k=${SECRET}&m=${message}`)
  })

  it('still lands an incomplete gift link on the claim screen, which says it is incomplete', () => {
    expect(routeForAppLink(`${HOST}/gift`)).toBe('/gift?k=')
    expect(routeForAppLink(`${HOST}/gift#nope`)).toBe('/gift?k=nope')
  })

  it('sends a tip link to the pay screen, keeping the assets asked for', () => {
    expect(routeForAppLink(`${HOST}/tip/${WALLET}`)).toBe(`/pay/${WALLET}`)
    expect(routeForAppLink(`${HOST}/tip/${WALLET}?assets=skr`)).toBe(`/pay/${WALLET}?assets=skr`)
    expect(routeForAppLink(`${HOST}/tip/${WALLET}?assets=usdc,skr#x`)).toBe(`/pay/${WALLET}?assets=usdc%2Cskr`)
  })

  it('leaves everything else alone', () => {
    for (const url of [
      `envelope://gift?k=${SECRET}`,
      `envelope://pay/${WALLET}`,
      '/home',
      `${HOST}/tip/not-an-address`,
      `${HOST}/tier/${WALLET}`,
      HOST,
      `${HOST}/giftcards#${SECRET}`,
    ]) {
      expect(routeForAppLink(url)).toBeNull()
    }
  })
})
