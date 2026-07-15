import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';

export function Screen({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <View className={`flex-1 bg-sand ${className}`}>{children}</View>;
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <View className={`rounded-2xl border border-line bg-white p-4 ${className}`}>{children}</View>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text className="mb-2 text-xs font-bold uppercase tracking-wide text-mist">{children}</Text>;
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View className="items-center px-8 py-16">
      <Text className="text-center text-lg font-bold text-ink">{title}</Text>
      {subtitle ? <Text className="mt-2 text-center text-base text-mist">{subtitle}</Text> : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  tone = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'danger' | 'ghost';
}) {
  const tones = {
    primary: 'bg-forest-700',
    danger: 'bg-danger',
    ghost: 'bg-forest-100',
  } as const;
  const text = tone === 'ghost' ? 'text-forest-700' : 'text-white';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`min-h-[48px] items-center justify-center rounded-xl px-4 ${tones[tone]} ${disabled ? 'opacity-50' : ''}`}
    >
      <Text className={`text-base font-bold ${text}`}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  return (
    <View className="mb-3">
      <Text className="mb-1 text-sm font-semibold text-ink">{label}</Text>
      <TextInput
        placeholderTextColor="#6b7c74"
        className="min-h-[48px] rounded-xl border border-line bg-white px-3 text-base text-ink"
        {...props}
      />
      {error ? <Text className="mt-1 text-sm text-danger">{error}</Text> : null}
    </View>
  );
}

export function Chip({
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
      className={`mr-2 rounded-full border px-3 py-2 ${active ? 'border-forest-700 bg-forest-700' : 'border-line bg-white'}`}
    >
      <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}
