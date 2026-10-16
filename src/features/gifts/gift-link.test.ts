import { describe, expect, it, vi } from 'vitest'
import { giftLink } from '../../config/site'
import {
  cleanGiftMessage,
  decodeGiftMessage,
  encodeGiftMessage,
  GIFT_MESSAGE_MAX,
  splitGiftFragment,
} from './gift-link'

// The relayer config reads React Native's Platform, which doesn't load under Vitest.
vi.mock('../../config/relayer', () => ({ RELAYER_URL: 'https://relayer.test' }))

const SECRET = '4kdGXt8sLxntuKKEvUcho2KxJruS75M8KREQzF5s7PL'

describe('gift messages', () => {
  it('round-trips through the link, emoji and accents included', () => {
    for (const message of ['Happy birthday!', 'Merci beaucoup, à bientôt 🎉', 'Rent + snacks / 50-50']) {
      const encoded = encodeGiftMessage(message)
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(decodeGiftMessage(encoded)).toBe(message)
    }
  })

  it('puts the message after the secret, and only when there is one', () => {
    expect(giftLink(SECRET)).toMatch(new RegExp(`/gift#${SECRET}$`))
    const link = giftLink(SECRET, 'Thanks!')
    const { secret, encodedMessage } = splitGiftFragment(link.split('#')[1]!)
    expect(secret).toBe(SECRET)
    expect(decodeGiftMessage(encodedMessage)).toBe('Thanks!')
    expect(giftLink(SECRET, '   ')).toBe(giftLink(SECRET))
  })

  it('keeps messages to one short line', () => {
    expect(cleanGiftMessage('  two\nlines\t here ')).toBe('two lines here')
    const long = '🎁'.repeat(GIFT_MESSAGE_MAX + 10)
    expect(Array.from(cleanGiftMessage(long))).toHaveLength(GIFT_MESSAGE_MAX)
    expect(decodeGiftMessage(encodeGiftMessage(long))).toBe('🎁'.repeat(GIFT_MESSAGE_MAX))
  })

  it('reads anything malformed as no message', () => {
    for (const encoded of [undefined, '', 'not base64!', '<script>', '_w', 'A'.repeat(641)]) {
      expect(decodeGiftMessage(encoded)).toBeNull()
    }
  })
})
