import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/useAppTheme';

const TAB_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap }> = {
  index: { label: 'Familie', icon: 'people-outline', iconActive: 'people' },
  documents: { label: 'Dokumente', icon: 'document-text-outline', iconActive: 'document-text' },
};

/** Minimal bottom tabs – two destinations, clear active underline. */
export function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, scheme } = useAppTheme();
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8);
  const isDark = scheme === 'dark';

  return (
    <View
      style={{
        paddingBottom: bottomPad,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        backgroundColor: isDark ? '#10241c' : '#f7fbf8',
      }}
    >
      <View style={{ flexDirection: 'row', paddingHorizontal: 12 }}>
        {state.routes.map((route, index) => {
          const meta = TAB_META[route.name];
          if (!meta) return null;

          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label = options.title || meta.label;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={label}
              onPress={onPress}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 6,
                minHeight: 48,
              }}
            >
              <Ionicons
                name={focused ? meta.iconActive : meta.icon}
                size={22}
                color={focused ? colors.pine : isDark ? '#8aa094' : '#7a9086'}
              />
              <Text
                style={{
                  marginTop: 4,
                  fontFamily: focused ? 'DMSans_700Bold' : 'DMSans_400Regular',
                  fontSize: 12,
                  color: focused ? colors.pine : isDark ? '#8aa094' : '#7a9086',
                }}
              >
                {label}
              </Text>
              <View
                style={{
                  marginTop: 6,
                  height: 3,
                  width: 28,
                  borderRadius: 2,
                  backgroundColor: focused ? colors.pine : 'transparent',
                }}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
