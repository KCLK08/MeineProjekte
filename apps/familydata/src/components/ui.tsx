import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/useAppTheme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Screen({
  children,
  className = '',
  /** Add bottom inset for stack screens (not tab roots – tab bar already pads). */
  safeBottom = true,
}: {
  children: React.ReactNode;
  className?: string;
  safeBottom?: boolean;
}) {
  const { colors, scheme } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      className={`flex-1 bg-canvas dark:bg-[#0d1612] ${className}`}
      style={safeBottom ? { paddingBottom: insets.bottom } : undefined}
    >
      <LinearGradient
        colors={
          scheme === 'dark'
            ? [colors.canvasTop, colors.canvas, colors.canvas]
            : [colors.canvasTop, colors.canvas, colors.canvas]
        }
        locations={[0, 0.28, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 220 }}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  const size = compact ? 36 : 52;
  return (
    <View className={compact ? '' : 'mb-1'}>
      <View className="flex-row items-center gap-2.5">
        <Image
          source={require('../../assets/images/FamilyVault.png')}
          style={{ width: size, height: size, borderRadius: size * 0.22 }}
          contentFit="cover"
        />
        <Text
          className={`font-display text-pine-700 dark:text-pine-400 ${compact ? 'text-lg' : 'text-2xl'}`}
          style={{ letterSpacing: -0.4 }}
        >
          Family Vault
        </Text>
      </View>
      {!compact ? (
        <Text className="mt-1 font-sans text-sm text-mute dark:text-[#9bb0a6]">
          Privater Familienordner · nur auf diesem Gerät
        </Text>
      ) : null}
    </View>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View className="mb-5 flex-row items-end justify-between gap-3">
      <View className="flex-1">
        <Text className="font-display text-3xl text-ink dark:text-[#e7f2ec]" style={{ letterSpacing: -0.6 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-1.5 font-sans text-[15px] leading-5 text-mute dark:text-[#9bb0a6]">{subtitle}</Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text className="mb-2.5 font-sansBold text-[11px] uppercase tracking-[1.4px] text-mute dark:text-[#9bb0a6]">
      {children}
    </Text>
  );
}

export function EmptyState({
  title,
  subtitle,
  icon = 'folder-open-outline',
}: {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useAppTheme();
  return (
    <View className="items-center px-8 py-14">
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl bg-pine-100 dark:bg-[#1a3028]">
        <Ionicons name={icon} size={28} color={colors.iconOnSoft} />
      </View>
      <Text className="text-center font-displayMedium text-xl text-ink dark:text-[#e7f2ec]">{title}</Text>
      {subtitle ? (
        <Text className="mt-2 text-center font-sans text-[15px] leading-5 text-mute dark:text-[#9bb0a6]">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  tone = 'primary',
  icon,
  compact,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'danger' | 'ghost' | 'soft';
  icon?: keyof typeof Ionicons.glyphMap;
  compact?: boolean;
}) {
  const { colors } = useAppTheme();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const tones = {
    primary: 'bg-pine-700 dark:bg-pine-500',
    danger: 'bg-danger',
    ghost: 'bg-transparent border border-line dark:border-[#2a3f35]',
    soft: 'bg-pine-100 dark:bg-[#1a3028]',
  } as const;
  const text =
    tone === 'ghost' || tone === 'soft'
      ? 'text-pine-700 dark:text-pine-400'
      : 'text-white';
  const iconColor =
    tone === 'ghost' || tone === 'soft' ? colors.iconOnSoft : '#ffffff';

  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 18, stiffness: 320 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 220 });
      }}
      style={animatedStyle}
      className={`min-h-[48px] flex-row items-center justify-center gap-2 rounded-2xl px-4 ${tones[tone]} ${
        compact ? 'min-h-[40px] px-3' : ''
      } ${disabled ? 'opacity-45' : ''}`}
    >
      {icon ? <Ionicons name={icon} size={18} color={iconColor} /> : null}
      <Text className={`font-sansBold text-[15px] ${text}`}>{label}</Text>
    </AnimatedPressable>
  );
}

export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  const { colors } = useAppTheme();
  return (
    <View className="mb-3.5">
      <Text className="mb-1.5 font-sansMedium text-sm text-ink dark:text-[#e7f2ec]">{label}</Text>
      <TextInput
        placeholderTextColor={colors.placeholder}
        className="min-h-[50px] rounded-2xl border border-line bg-paper px-3.5 font-sans text-base text-ink dark:border-[#2a3f35] dark:bg-[#15241d] dark:text-[#e7f2ec]"
        {...props}
      />
      {error ? <Text className="mt-1.5 font-sans text-sm text-danger">{error}</Text> : null}
    </View>
  );
}

export function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`mr-2 rounded-xl border px-3.5 py-2 ${
        active
          ? 'border-pine-700 bg-pine-700 dark:border-pine-500 dark:bg-pine-500'
          : 'border-line bg-paper dark:border-[#2a3f35] dark:bg-[#15241d]'
      }`}
    >
      <Text
        className={`font-sansMedium text-sm ${
          active ? 'text-white' : 'text-ink dark:text-[#e7f2ec]'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** @deprecated use FilterChip – kept for form selects */
export const Chip = FilterChip;

export function Avatar({
  initials,
  size = 48,
}: {
  initials: string;
  size?: number;
}) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size * 0.32 }}
      className="items-center justify-center bg-pine-700 dark:bg-pine-500"
    >
      <Text
        className="font-sansBold text-white"
        style={{ fontSize: Math.max(13, size * 0.34) }}
      >
        {initials.slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}

export function StatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'ok' | 'warn' | 'danger';
}) {
  const bg = {
    neutral: 'bg-pine-100 dark:bg-[#1a3028]',
    ok: 'bg-pine-100 dark:bg-[#1a3028]',
    warn: 'bg-amber-100 dark:bg-[#3b2a12]',
    danger: 'bg-red-100 dark:bg-[#3b1512]',
  } as const;
  const text = {
    neutral: 'text-pine-700 dark:text-pine-400',
    ok: 'text-ok dark:text-[#4ade80]',
    warn: 'text-warn dark:text-[#fbbf24]',
    danger: 'text-danger dark:text-[#f97066]',
  } as const;
  return (
    <View className={`self-start rounded-lg px-2 py-1 ${bg[tone]}`}>
      <Text className={`font-sansMedium text-[11px] ${text[tone]}`}>{label}</Text>
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  meta,
  leading,
  trailing,
  onPress,
  index = 0,
}: {
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  index?: number;
}) {
  const { colors } = useAppTheme();
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index * 45, 270)).springify().damping(18)}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        className="mb-2.5 flex-row items-center gap-3 rounded-2xl border border-line/80 bg-paper px-3.5 py-3.5 active:bg-pine-50 dark:border-[#2a3f35] dark:bg-[#15241d] dark:active:bg-[#1a3028]"
      >
        {leading}
        <View className="min-w-0 flex-1">
          <Text className="font-sansBold text-[16px] text-ink dark:text-[#e7f2ec]" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text className="mt-0.5 font-sans text-sm text-mute dark:text-[#9bb0a6]" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          {meta ? <View className="mt-2">{meta}</View> : null}
        </View>
        {trailing ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.chevron} /> : null)}
      </Pressable>
    </Animated.View>
  );
}

export function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View className="border-b border-line/70 py-3 last:border-b-0 dark:border-[#2a3f35]/70">
      <Text className="font-sansMedium text-[11px] uppercase tracking-[1px] text-mute dark:text-[#9bb0a6]">
        {label}
      </Text>
      <Text className="mt-1 font-sans text-[15px] text-ink dark:text-[#e7f2ec]">
        {value?.trim() ? value : '—'}
      </Text>
    </View>
  );
}

export function Panel({
  children,
  className = '',
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      className={`overflow-hidden rounded-2xl border border-line bg-paper px-4 dark:border-[#2a3f35] dark:bg-[#15241d] ${className}`}
      style={style}
    >
      {children}
    </View>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  tone = 'solid',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
  tone?: 'solid' | 'soft';
}) {
  const { colors } = useAppTheme();
  const soft = tone === 'soft';
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      className={
        soft
          ? 'h-11 w-11 items-center justify-center rounded-2xl border border-line bg-paper active:opacity-90 dark:border-[#2a3f35] dark:bg-[#15241d]'
          : 'h-11 w-11 items-center justify-center rounded-2xl bg-pine-700 active:opacity-90 dark:bg-pine-500'
      }
    >
      <Ionicons name={icon} size={22} color={soft ? colors.pine : '#fff'} />
    </Pressable>
  );
}

export function LoadingBlock({ label = 'Wird geladen…' }: { label?: string }) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-1 items-center justify-center gap-3">
      <ActivityIndicator color={colors.pine} />
      <Text className="font-sans text-mute dark:text-[#9bb0a6]">{label}</Text>
    </View>
  );
}

export function ThemeOption({
  label,
  subtitle,
  active,
  onPress,
  icon,
}: {
  label: string;
  subtitle: string;
  active: boolean;
  onPress: () => void;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      className={`mb-2.5 flex-row items-center gap-3 rounded-2xl border px-3.5 py-3.5 ${
        active
          ? 'border-pine-700 bg-pine-100 dark:border-pine-500 dark:bg-[#1a3028]'
          : 'border-line bg-paper dark:border-[#2a3f35] dark:bg-[#15241d]'
      }`}
    >
      <View className="h-11 w-11 items-center justify-center rounded-2xl bg-pine-700 dark:bg-pine-500">
        <Ionicons name={icon} size={20} color="#fff" />
      </View>
      <View className="flex-1">
        <Text className="font-sansBold text-[16px] text-ink dark:text-[#e7f2ec]">{label}</Text>
        <Text className="mt-0.5 font-sans text-sm text-mute dark:text-[#9bb0a6]">{subtitle}</Text>
      </View>
      {active ? <Ionicons name="checkmark-circle" size={22} color={colors.pine} /> : null}
    </Pressable>
  );
}

export function usePressScale() {
  const scale = useSharedValue(1);
  useEffect(() => undefined, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    style,
    onPressIn: () => {
      scale.value = withSpring(0.97, { damping: 18, stiffness: 320 });
    },
    onPressOut: () => {
      scale.value = withSpring(1, { damping: 14, stiffness: 220 });
    },
  };
}

/** Back-compat alias used by older screens */
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <View className={`rounded-2xl border border-line bg-paper p-4 dark:border-[#2a3f35] dark:bg-[#15241d] ${className}`}>
      {children}
    </View>
  );
}
