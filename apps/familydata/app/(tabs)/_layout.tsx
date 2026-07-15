import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#f4f1ea' },
        headerTitleStyle: { fontWeight: '800', color: '#14201a' },
        tabBarActiveTintColor: '#1b4332',
        tabBarInactiveTintColor: '#6b7c74',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#d7e0db',
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Familie',
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: 'Dokumente',
          tabBarIcon: ({ color, size }) => <Ionicons name="folder-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Suche',
          tabBarIcon: ({ color, size }) => <Ionicons name="search-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Einstellungen',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
