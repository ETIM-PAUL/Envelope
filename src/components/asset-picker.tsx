// Token choice, everywhere one is made. `AssetToggle` picks one (Home, Add funds, Withdraw, Send);
// `AssetChips` picks any number (which tokens a pot accepts, which ones Receive asks for). Both
// hide themselves when there's nothing to choose between.
import { Pressable, Text, View } from 'react-native'
import { assetLabel, availableAssetIds, type AssetId } from '../config/assets'
import { colors, fontFamily } from '../design/tokens'

export function AssetToggle({
  value,
  onChange,
  options = availableAssetIds(),
}: {
  value: AssetId
  onChange: (asset: AssetId) => void
  options?: AssetId[]
}) {
  if (options.length < 2) return null
  return (
    <View
      className="flex-row bg-ink-900 border border-ink-800 rounded-full p-1 self-center"
      accessibilityRole="tablist"
    >
      {options.map((asset) => {
        const selected = asset === value
        return (
          <Pressable
            key={asset}
            onPress={() => onChange(asset)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            className={`px-5 py-2 rounded-full ${selected ? 'bg-ink-700' : ''}`}
          >
            <Text
              style={{
                fontFamily: fontFamily.uiSemibold,
                fontSize: 14,
                color: selected ? colors.paper[500] : colors.mute[500],
              }}
            >
              {assetLabel(asset)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function AssetChips({
  selected,
  onChange,
  options = availableAssetIds(),
}: {
  selected: AssetId[]
  onChange: (assets: AssetId[]) => void
  options?: AssetId[]
}) {
  if (options.length < 2) return null
  return (
    <View className="flex-row gap-2">
      {options.map((asset) => {
        const on = selected.includes(asset)
        // Never allow zero: the last selected chip can't be turned off.
        const toggle = () => {
          if (on && selected.length === 1) return
          onChange(
            on ? selected.filter((a) => a !== asset) : options.filter((a) => a === asset || selected.includes(a)),
          )
        }
        return (
          <Pressable
            key={asset}
            onPress={toggle}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            className={`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-2xl border ${
              on ? 'bg-ink-800 border-paper-400' : 'bg-ink-900 border-ink-800'
            }`}
          >
            <View
              className={`w-4 h-4 rounded-full border items-center justify-center ${on ? 'border-paper-500' : 'border-mute-600'}`}
            >
              {on ? <View className="w-2 h-2 rounded-full bg-paper-500" /> : null}
            </View>
            <Text
              style={{
                fontFamily: fontFamily.uiSemibold,
                fontSize: 15,
                color: on ? colors.paper[500] : colors.mute[500],
              }}
            >
              {assetLabel(asset)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
