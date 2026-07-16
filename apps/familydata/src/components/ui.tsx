import { Ionicons } from '@expo/vector-icons';
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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Screen({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={`flex-1 bg-canvas ${className}`}>
      <LinearGradient
        colors={['#d8ebe2', '#e8f0ec', '#e8f0ec']}
        locations={[0, 0.28, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 220 }}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <View className={compact ? '' : 'mb-1'}>
      <Text
        className={`font-display text-pine-700 ${compact ? 'text-lg' : 'text-2xl'}`}
        style={{ letterSpacing: -0.4 }}
      >
        FamilyData
      </Text>
      {!compact ? (
        <Text className="mt-1 font-sans text-sm text-mute">Privater Familienordner · nur auf diesem Gerät</Text>
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
        <Text className="font-display text-3xl text-ink" style={{ letterSpacing: -0.6 }}>
          {title}
        </Text>
        {subtitle ? <Text className="mt-1.5 font-sans text-[15px] leading-5 text-mute">{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text className="mb-2.5 font-sansBold text-[11px] uppercase tracking-[1.4px] text-mute">{children}</Text>
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
  return (
    <View className="items-center px-8 py-14">
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl bg-pine-100">
        <Ionicons name={icon} size={28} color="#0c3b2e" />
      </View>
      <Text className="text-center font-displayMedium text-xl text-ink">{title}</Text>
      {subtitle ? <Text className="mt-2 text-center font-sans text-[15px] leading-5 text-mute">{subtitle}</Text> : null}
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
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const tones = {
    primary: 'bg-pine-700',
    danger: 'bg-danger',
    ghost: 'bg-transparent border border-line',
    soft: 'bg-pine-100',
  } as const;
  const text =
    tone === 'ghost' || tone === 'soft' ? 'text-pine-700' : 'text-white';
  const iconColor = tone === 'ghost' || tone === 'soft' ? '#0c3b2e' : '#ffffff';

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
  return (
    <View className="mb-3.5">
      <Text className="mb-1.5 font-sansMedium text-sm text-ink">{label}</Text>
      <TextInput
        placeholderTextColor="#7a9086"
        className="min-h-[50px] rounded-2xl border border-line bg-paper px-3.5 font-sans text-base text-ink"
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
        active ? 'border-pine-700 bg-pine-700' : 'border-line bg-paper'
      }`}
    >
      <Text className={`font-sansMedium text-sm ${active ? 'text-white' : 'text-ink'}`}>{label}</Text>
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
      className="items-center justify-center bg-pine-700"
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
  const map = {
    neutral: 'bg-pine-100 text-pine-700',
    ok: 'bg-pine-100 text-ok',
    warn: 'bg-amber-100 text-warn',
    danger: 'bg-red-100 text-danger',
  } as const;
  const [bg, text] = [
    map[tone].split(' ')[0],
    map[tone].split(' ')[1],
  ];
  return (
    <View className={`self-start rounded-lg px-2 py-1 ${bg}`}>
      <Text className={`font-sansMedium text-[11px] ${text}`}>{label}</Text>
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
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index * 45, 270)).springify().damping(18)}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        className="mb-2.5 flex-row items-center gap-3 rounded-2xl border border-line/80 bg-paper px-3.5 py-3.5 active:bg-pine-50"
      >
        {leading}
        <View className="min-w-0 flex-1">
          <Text className="font-sansBold text-[16px] text-ink" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text className="mt-0.5 font-sans text-sm text-mute" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          {meta ? <View className="mt-2">{meta}</View> : null}
        </View>
        {trailing ?? (onPress ? <Ionicons name="chevron-forward" size={18} color="#5a7368" /> : null)}
      </Pressable>
    </Animated.View>
  );
}

export function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View className="border-b border-line/70 py-3 last:border-b-0">
      <Text className="font-sansMedium text-[11px] uppercase tracking-[1px] text-mute">{label}</Text>
      <Text className="mt-1 font-sans text-[15px] text-ink">{value?.trim() ? value : '—'}</Text>
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
    <View className={`overflow-hidden rounded-2xl border border-line bg-paper px-4 ${className}`} style={style}>
      {children}
    </View>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-2xl bg-pine-700 active:opacity-90"
    >
      <Ionicons name={icon} size={22} color="#fff" />
    </Pressable>
  );
}

export function LoadingBlock({ label = 'Wird geladen…' }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-3">
      <ActivityIndicator color="#0c3b2e" />
      <Text className="font-sans text-mute">{label}</Text>
    </View>
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
  return <View className={`rounded-2xl border border-line bg-paper p-4 ${className}`}>{children}</View>;
}
