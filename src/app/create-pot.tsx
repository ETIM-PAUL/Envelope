// Phase 15: name + close date → derive pot key → create + configure pot account → create_pot,
// all behind useCreatePot's one call. Cover image is explicitly out of scope here (the plan
// calls it "local only" — a later, purely cosmetic addition, not load-bearing for the feature).
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import { BackButton } from '../components/back-button'
import { Button } from '../components/button'
import { Screen } from '../components/screen'
import { colors, fontFamily } from '../design/tokens'
import { useCreatePot } from '../features/pots/use-create-pot'
import { formatError } from '../utils/format-error'

const DAY_SECONDS = 24 * 60 * 60

export default function CreatePot() {
  const router = useRouter()
  const { createPot } = useCreatePot()
  const [name, setName] = useState('')
  const [daysText, setDaysText] = useState('7')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const days = Number(daysText)
  const validDays = Number.isInteger(days) && days > 0 && days <= 365

  async function handleCreate() {
    if (isBusy || !name.trim() || !validDays) return
    setIsBusy(true)
    setError(null)
    try {
      const closeTs = BigInt(Math.floor(Date.now() / 1000) + days * DAY_SECONDS)
      const summary = await createPot(name.trim(), closeTs)
      router.replace({ pathname: '/pot/[potPda]', params: { potPda: summary.potPda } })
    } catch (e) {
      setError(formatError(e))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <Screen center>
      <BackButton />
      <Text className="text-paper-500 text-2xl mb-2 text-center" style={{ fontFamily: fontFamily.display }}>
        New pot
      </Text>
      <Text className="text-mute-500 text-base mb-10 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
        A sealed group gift. You&apos;ll see the total and who gave what — no one else will.
      </Text>

      <View className="w-full max-w-xs mb-5">
        <Text className="text-mute-500 text-sm mb-2" style={{ fontFamily: fontFamily.uiSemibold }}>
          Name
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Maya's birthday"
          placeholderTextColor={colors.mute[600]}
          editable={!isBusy}
          className="bg-ink-900 border border-ink-800 rounded-2xl px-4 py-4 text-paper-500"
          style={{ fontFamily: fontFamily.ui, fontSize: 15 }}
        />
      </View>

      <View className="w-full max-w-xs mb-10">
        <Text className="text-mute-500 text-sm mb-2" style={{ fontFamily: fontFamily.uiSemibold }}>
          Closes in (days)
        </Text>
        <TextInput
          value={daysText}
          onChangeText={setDaysText}
          keyboardType="number-pad"
          editable={!isBusy}
          className="bg-ink-900 border border-ink-800 rounded-2xl px-4 py-4 text-paper-500"
          style={{ fontFamily: fontFamily.ui, fontSize: 15 }}
        />
      </View>

      <View className="w-full max-w-xs">
        <Button
          label={isBusy ? 'Creating…' : 'Create pot'}
          onPress={() => void handleCreate()}
          disabled={!name.trim() || !validDays}
          busy={isBusy}
        />
      </View>
      {error ? (
        <Text className="text-seal-500 mt-4 text-center max-w-xs" style={{ fontFamily: fontFamily.ui }}>
          {error}
        </Text>
      ) : null}
    </Screen>
  )
}
