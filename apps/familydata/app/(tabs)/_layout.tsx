import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Redirect, Tabs } from 'expo-router';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFamilyStore } from '@/store/familyStore';
import { useAppTheme } from '@/theme/useAppTheme';

function FamilyCenterTabButton({ accessibilityState, onPress, onLongPress }: BottomTabBarButtonProps) {
  const focused = Boolean(accessibilityState?.selected);
  const { colors } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel="Familie"
      onPress={onPress}
      onLongPress={onLongPress}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'flex-start',
        top: -20,
      }}
    >
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: 30,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: focused ? colors.pine : colors.paper,
          borderWidth: 4,
          borderColor: colors.tabBar,
          shadowColor: '#0b1a14',
          shadowOpacity: focused ? 0.28 : 0.14,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        <Ionicons
          name={focused ? 'people' : 'people-outline'}
          size={26}
          color={focused ? '#ffffff' : colors.pine}
        />
      </View>
      <Text
        style={{
          marginTop: 4,
          fontSize: 11,
          fontFamily: 'DMSans_500Medium',
          color: focused ? colors.pine : colors.mute,
        }}
      >
        Familie
      </Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const ready = useFamilyStore((s) => s.ready);
  const loading = useFamilyStore((s) => s.loading);
  const setupComplete = useFamilyStore((s) => s.setupComplete);
  const bottom = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0);
  const baseHeight = 64;

  if (ready && !loading && !setupComplete) {
    return <Redirect href="/setup" />;
  }

  return (
    <Tabs
      initialRouteName="index"
      safeAreaInsets={{ bottom: 0 }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.pine,
        tabBarInactiveTintColor: colors.mute,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: {
          fontFamily: 'DMSans_500Medium',
          fontSize: 11,
          marginBottom: Platform.OS === 'ios' ? 0 : 2,
        },
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.line,
          height: baseHeight + bottom,
          paddingTop: 8,
          paddingBottom: bottom,
        },
      }}
    >
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
        name="index"
        options={{
          title: 'Familie',
          tabBarLabel: () => null,
          tabBarIcon: () => null,
          tabBarButton: (props) => <FamilyCenterTabButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Einstellungen',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
