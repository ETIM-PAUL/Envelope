// Subpath import — see src/app/(tabs)/_layout.tsx for why not the `@expo/vector-icons` barrel.
import Feather from '@expo/vector-icons/Feather'
import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshControl, SectionList, Text, View } from 'react-native'
import { Screen } from '../../components/screen'
import { colors, fontFamily } from '../../design/tokens'
import { useActivity } from '../../features/account/use-activity'
import {
  useNotifications,
  useRefreshPotContributions,
  type AppNotification,
  type NotificationKind,
} from '../../features/notifications/use-notifications'
import { formatBaseUnits } from '../../utils/format-amount'

const DECIMALS = 6 // cUSDC and SKR both
// How long the unread dots stay visible on arrival before the visit counts as "seen".
const MARK_SEEN_AFTER_MS = 1500

type Presentation = { icon: keyof typeof Feather.glyphMap; text: string; inbound: boolean }

function present(item: AppNotification): Presentation {
  const amount = item.amount ? formatBaseUnits(BigInt(item.amount), DECIMALS) : ''
  const pot = item.label ?? 'Your'
  const copy: Record<NotificationKind, Presentation> = {
    deposit: { icon: 'download', text: `${amount} cUSDC deposited from wallet`, inbound: true },
    withdraw: { icon: 'upload', text: `${amount} cUSDC withdrawn to wallet`, inbound: false },
    received: { icon: 'arrow-down-left', text: `${amount} cUSDC received privately`, inbound: true },
    sent: { icon: 'arrow-up-right', text: `${amount} cUSDC sent privately`, inbound: false },
    'pot-created': { icon: 'archive', text: `${pot} pot created`, inbound: false },
    'pot-received': { icon: 'gift', text: `${amount} cUSDC received for ${item.label ?? 'your pot'}`, inbound: true },
    'pot-closed': { icon: 'lock', text: `${pot} pot closed`, inbound: false },
    stake: { icon: 'trending-up', text: `${amount} SKR staked`, inbound: false },
    'unstake-requested': { icon: 'clock', text: 'Unstake requested — SKR unlocks after the cooldown', inbound: false },
    'unstake-withdrawn': { icon: 'corner-up-left', text: 'Unstaked SKR returned to wallet', inbound: true },
  }
  return copy[item.kind]
}

function dayLabel(at: number): string {
  const day = new Date(at)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (day.toDateString() === today.toDateString()) return 'Today'
  if (day.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function timeLabel(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export default function Notifications() {
  const { items, lastSeenAt, markAllSeen } = useNotifications()
  const { refetch: refreshTransfers } = useActivity()
  const refreshPotContributions = useRefreshPotContributions()
  const [refreshing, setRefreshing] = useState(false)
  // What counted as seen when this visit began — so the dots don't vanish the instant the
  // visit itself is recorded as seen.
  const [seenBeforeVisit, setSeenBeforeVisit] = useState<number | null>(null)
  const lastSeenRef = useRef(lastSeenAt)
  useEffect(() => {
    lastSeenRef.current = lastSeenAt
  }, [lastSeenAt])

  const refresh = useCallback(async () => {
    await Promise.allSettled([refreshTransfers(), refreshPotContributions()])
  }, [refreshTransfers, refreshPotContributions])

  useFocusEffect(
    useCallback(() => {
      setSeenBeforeVisit(lastSeenRef.current)
      void refresh()
      const timer = setTimeout(() => void markAllSeen(), MARK_SEEN_AFTER_MS)
      return () => clearTimeout(timer)
    }, [refresh, markAllSeen]),
  )

  const sections = useMemo(() => {
    const byDay = new Map<string, AppNotification[]>()
    for (const item of items) {
      const label = dayLabel(item.at)
      byDay.set(label, [...(byDay.get(label) ?? []), item])
    }
    return [...byDay.entries()].map(([title, data]) => ({ title, data }))
  }, [items])

  return (
    <Screen>
      <Text className="text-paper-500 text-2xl mb-1" style={{ fontFamily: fontFamily.display }}>
        Notifications
      </Text>
      <Text className="text-mute-500 text-sm mb-6" style={{ fontFamily: fontFamily.ui }}>
        Every movement of your private funds, decrypted on this device only.
      </Text>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.mute[500]}
            colors={[colors.seal[500]]}
            progressBackgroundColor={colors.ink[900]}
            onRefresh={async () => {
              setRefreshing(true)
              await refresh()
              setRefreshing(false)
            }}
          />
        }
        ListEmptyComponent={
          <View className="mt-16 items-center px-6">
            <Feather name="bell" size={22} color={colors.mute[600]} />
            <Text className="text-paper-400 text-base mt-4 text-center" style={{ fontFamily: fontFamily.uiSemibold }}>
              Nothing yet
            </Text>
            <Text className="text-mute-500 text-sm mt-1 text-center" style={{ fontFamily: fontFamily.ui }}>
              Deposits, withdrawals, transfers and pot updates will show up here.
            </Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text className="text-mute-600 text-xs mt-5 mb-2" style={{ fontFamily: fontFamily.uiSemibold }}>
            {section.title}
          </Text>
        )}
        ItemSeparatorComponent={() => <View className="h-px bg-ink-800 my-3 ml-[52px]" />}
        renderItem={({ item }) => {
          const { icon, text, inbound } = present(item)
          const unread = seenBeforeVisit !== null && item.at > seenBeforeVisit
          return (
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-full bg-ink-900 border border-ink-800 items-center justify-center">
                <Feather name={icon} size={16} color={inbound ? colors.success : colors.paper[400]} />
              </View>
              <View className="flex-1">
                <Text className="text-paper-500 text-[15px] leading-5" style={{ fontFamily: fontFamily.uiSemibold }}>
                  {text}
                </Text>
                <Text className="text-mute-600 text-xs mt-0.5" style={{ fontFamily: fontFamily.ui }}>
                  {timeLabel(item.at)}
                </Text>
              </View>
              {unread ? <View accessibilityLabel="Unread" className="w-2 h-2 rounded-full bg-seal-500" /> : null}
            </View>
          )
        }}
      />
    </Screen>
  )
}
