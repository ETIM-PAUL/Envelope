// Subpath import, not the `@expo/vector-icons` barrel: the barrel re-exports every icon set
// (Ionicons, MaterialCommunityIcons, ...), and Metro bundles each set's whole font file for
// anything imported from it — ~3MB of unused icon fonts for one 56KB set otherwise.
import Feather from '@expo/vector-icons/Feather'
import { Redirect, Tabs } from 'expo-router'
import { colors } from '../../design/tokens'
import { useNotifications } from '../../features/notifications/use-notifications'
import { useAppStore } from '../../store/app-store'

const TAB_ICONS = {
  home: 'mail',
  send: 'arrow-up-right',
  receive: 'arrow-down-left',
  pots: 'archive',
  stake: 'award',
  notifications: 'bell',
} as const

export default function TabsLayout() {
  // The gate at app/index.tsx is the only way in — if this group is reached without a connected
  // wallet (e.g. a stale deep link after disconnect), bounce back rather than showing empty tabs.
  const walletAddress = useAppStore((s) => s.walletAddress)
  const { unreadCount } = useNotifications()
  if (!walletAddress) {
    return <Redirect href="/" />
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.seal[500],
        tabBarInactiveTintColor: colors.mute[600],
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.ink[900],
          borderTopColor: colors.ink[800],
          borderTopWidth: 1,
          height: 64,
          paddingTop: 10,
        },
      }}
    >
      {(Object.keys(TAB_ICONS) as (keyof typeof TAB_ICONS)[]).map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            tabBarAccessibilityLabel:
              name === 'notifications' && unreadCount > 0 ? `Notifications, ${unreadCount} unread` : name,
            tabBarBadge:
              name === 'notifications' && unreadCount > 0 ? (unreadCount > 9 ? '9+' : unreadCount) : undefined,
            tabBarBadgeStyle: { backgroundColor: colors.seal[500], color: colors.paper[500], fontSize: 10 },
            tabBarIcon: ({ color, focused }) => (
              <Feather name={TAB_ICONS[name]} size={22} color={color} style={{ opacity: focused ? 1 : 0.8 }} />
            ),
          }}
        />
      ))}
    </Tabs>
  )
}
