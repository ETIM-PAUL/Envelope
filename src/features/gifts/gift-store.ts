// The gifts this device has sent: what each holds and its secret, so an unclaimed gift can be
// taken back. In SecureStore like the rest of the app's local records (encrypted at rest by the
// Android Keystore). Not behind a biometric prompt: a gift's secret also travels in the link the
// sender shared, and losing it here would mean losing the only way to take the gift back.
import * as SecureStore from 'expo-secure-store'
import type { AssetId } from '../../config/assets'

export type GiftRecord = {
  giftOwner: string // the gift wallet's address (public; its token account is what's on-chain)
  asset: AssetId
  amount: string // stringified bigint, base units
  createdAt: number
  takenBack?: boolean
}

const MAX_GIFTS = 20
const listKey = (owner: string) => `envelope-gifts-${owner}`
const secretKey = (giftOwner: string) => `envelope-gift-secret-${giftOwner}`

export async function listGifts(owner: string): Promise<GiftRecord[]> {
  const raw = await SecureStore.getItemAsync(listKey(owner)).catch(() => null)
  if (!raw) return []
  try {
    return JSON.parse(raw) as GiftRecord[]
  } catch {
    return []
  }
}

async function writeGifts(owner: string, gifts: GiftRecord[]): Promise<void> {
  await SecureStore.setItemAsync(listKey(owner), JSON.stringify(gifts.slice(0, MAX_GIFTS)))
}

// Saved before the funds are sent, so a crash mid-send can't strand a funded gift.
export async function saveGift(owner: string, gift: GiftRecord, secret: string): Promise<void> {
  await SecureStore.setItemAsync(secretKey(gift.giftOwner), secret)
  await writeGifts(owner, [gift, ...(await listGifts(owner)).filter((g) => g.giftOwner !== gift.giftOwner)])
}

export async function readGiftSecret(giftOwner: string): Promise<string | null> {
  return SecureStore.getItemAsync(secretKey(giftOwner)).catch(() => null)
}

export async function markGiftTakenBack(owner: string, giftOwner: string): Promise<void> {
  await writeGifts(
    owner,
    (await listGifts(owner)).map((g) => (g.giftOwner === giftOwner ? { ...g, takenBack: true } : g)),
  )
}
