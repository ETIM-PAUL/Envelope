// Phase 13: the relayer's base URL. `EXPO_PUBLIC_RELAYER_URL` (inlined into the bundle at build
// time, see .env.example) wins when set. Otherwise, in development, the relayer is assumed to run
// on the same machine as the Metro dev server, so its URL is derived from the host the app loaded
// its bundle from (`hostUri`, e.g. "192.168.1.20:8081"). That host is reachable from wherever the
// app is running — emulator or a phone on the same Wi-Fi — unlike `localhost`, which on a device
// means the device itself and only reached the relayer while an `adb reverse tcp:8787` forward
// happened to be in place (forwards vanish whenever the emulator or adb restarts).
import Constants from 'expo-constants'

const RELAYER_PORT = 8787

function devServerHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri
  return hostUri ? hostUri.split(':')[0]! : null
}

export const RELAYER_URL =
  process.env.EXPO_PUBLIC_RELAYER_URL || `http://${devServerHost() ?? 'localhost'}:${RELAYER_PORT}`
