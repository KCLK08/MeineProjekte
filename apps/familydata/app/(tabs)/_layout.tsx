import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0c3b2e',
        tabBarInactiveTintColor: '#7a9086',
        tabBarLabelStyle: {
          fontFamily: 'DMSans_500Medium',
          fontSize: 11,
          marginBottom: Platform.OS === 'ios' ? 0 : 4,
        },
        tabBarStyle: {
          backgroundColor: '#f7fbf8',
          borderTopColor: '#c5d7ce',
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Familie',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: 'Dokumente',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'documents' : 'documents-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Suche',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Mehr',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'menu' : 'menu-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
