import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/useAppTheme';

type TabMeta = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const TAB_META: Record<string, TabMeta> = {
  index: { label: 'Familie', icon: 'people-outline' },
  documents: { label: 'Dokumente', icon: 'document-text-outline' },
  settings: { label: 'Einstellungen', icon: 'settings-outline' },
};

/** Soft glass bottom bar with a dark pill around the active icon. */
export function PillTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { scheme } = useAppTheme();
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 10 : 8);
  const isDark = scheme === 'dark';

  const pillBg = isDark ? '#e7f2ec' : '#1c1c1e';
  const pillIcon = isDark ? '#10241c' : '#ffffff';
  const activeLabel = isDark ? '#e7f2ec' : '#111111';
  const inactive = isDark ? '#8aa094' : '#9ca3af';
  const barBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(16,36,28,0.08)';
  const barFallback = isDark ? 'rgba(16,28,23,0.88)' : 'rgba(247,251,248,0.88)';

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingBottom: bottomPad,
          borderTopColor: barBorder,
          backgroundColor: Platform.OS === 'android' ? barFallback : 'transparent',
        },
      ]}
    >
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={55}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFillObject}
        />
      ) : null}

      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const meta = TAB_META[route.name] || {
            label: descriptors[route.key]?.options.title || route.name,
            icon: 'ellipse-outline' as const,
          };
          const { options } = descriptors[route.key];

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

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel || meta.label}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.item}
            >
              <View
                style={[
                  styles.iconSlot,
                  focused && { backgroundColor: pillBg },
                ]}
              >
                <Ionicons
                  name={meta.icon}
                  size={22}
                  color={focused ? pillIcon : inactive}
                />
              </View>
              <Text
                style={[
                  styles.label,
                  {
                    color: focused ? activeLabel : inactive,
                    fontFamily: focused ? 'DMSans_700Bold' : 'DMSans_500Medium',
                  },
                ]}
                numberOfLines={1}
              >
                {meta.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  iconSlot: {
    minWidth: 56,
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    letterSpacing: -0.1,
  },
});
