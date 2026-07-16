import { Redirect, Tabs } from 'expo-router';

import { PillTabBar } from '@/components/PillTabBar';
import { useFamilyStore } from '@/store/familyStore';

export default function TabsLayout() {
  const ready = useFamilyStore((s) => s.ready);
  const loading = useFamilyStore((s) => s.loading);
  const setupComplete = useFamilyStore((s) => s.setupComplete);

  if (ready && !loading && !setupComplete) {
    return <Redirect href="/setup" />;
  }

  return (
    <Tabs
      initialRouteName="index"
      tabBar={(props) => <PillTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Familie' }} />
      <Tabs.Screen name="documents" options={{ title: 'Dokumente' }} />
      <Tabs.Screen name="settings" options={{ title: 'Einstellungen' }} />
    </Tabs>
  );
}
