import { Redirect, Tabs } from 'expo-router'
import { Text } from 'react-native'
import { colors } from '../../design/tokens'
import { useAppStore } from '../../store/app-store'

const TAB_ICONS: Record<string, string> = {
  home: '✉️',
  send: '↗️',
  receive: '↙️',
  pots: '🫙',
  stake: '🪙',
}

export default function TabsLayout() {
  // The gate at app/index.tsx is the only way in — if this group is reached without a connected
  // wallet (e.g. a stale deep link after disconnect), bounce back rather than showing empty tabs.
  const walletAddress = useAppStore((s) => s.walletAddress)
  if (!walletAddress) {
    return <Redirect href="/" />
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.seal[600],
        tabBarInactiveTintColor: colors.ink[600],
        tabBarStyle: { backgroundColor: colors.paper[50] },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: () => <Text>{TAB_ICONS.home}</Text> }} />
      <Tabs.Screen name="send" options={{ title: 'Send', tabBarIcon: () => <Text>{TAB_ICONS.send}</Text> }} />
      <Tabs.Screen name="receive" options={{ title: 'Receive', tabBarIcon: () => <Text>{TAB_ICONS.receive}</Text> }} />
      <Tabs.Screen name="pots" options={{ title: 'Pots', tabBarIcon: () => <Text>{TAB_ICONS.pots}</Text> }} />
      <Tabs.Screen name="stake" options={{ title: 'Stake', tabBarIcon: () => <Text>{TAB_ICONS.stake}</Text> }} />
    </Tabs>
  )
}
