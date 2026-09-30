// Sends push notifications via Expo's HTTP push API directly — no SDK dependency needed for a
// single-notification-type use case (incoming-activity alerts from the Helius webhook).
// https://docs.expo.dev/push-notifications/sending-notifications/#http2-api
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send'

export async function sendPushNotification(
  expoPushTokens: string[],
  message: { title: string; body: string; data?: Record<string, unknown> },
): Promise<void> {
  if (expoPushTokens.length === 0) return
  const messages = expoPushTokens.map((to) => ({ to, sound: 'default', ...message }))
  const response = await fetch(EXPO_PUSH_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(messages),
  })
  if (!response.ok) {
    throw new Error(`Expo push send failed: ${response.status} ${await response.text()}`)
  }
}
