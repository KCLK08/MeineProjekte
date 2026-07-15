import React from 'react';
import {
  Pressable,
  Text,
  View,
  StyleSheet,
  type PressableProps,
  type ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { colors, radius, spacing, typography } from '@meineprojekte/theme';

export { WebShell } from './WebShell';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type AppButtonProps = PressableProps & {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  style?: ViewStyle;
};

const variantStyles: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, fg: '#fff' },
  secondary: { bg: colors.primarySoft, fg: colors.primaryDark, border: colors.border },
  ghost: { bg: 'transparent', fg: colors.primaryDark, border: colors.border },
  danger: { bg: colors.danger, fg: '#fff' },
};

export function AppButton({
  title,
  variant = 'primary',
  loading,
  disabled,
  style,
  ...rest
}: AppButtonProps) {
  const v = variantStyles[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: v.bg, borderColor: v.border ?? v.bg, opacity: isDisabled ? 0.55 : pressed ? 0.88 : 1 },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <Text style={[styles.label, { color: v.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function DialogShell({
  title,
  message,
  children,
}: {
  title: string;
  message?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.dialog}>
      <Text style={styles.dialogTitle}>{title}</Text>
      {message ? <Text style={styles.dialogMessage}>{message}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: typography.sizes.md,
    fontWeight: '700',
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  dialogTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: '800',
    color: colors.text,
  },
  dialogMessage: {
    fontSize: typography.sizes.md,
    color: colors.textMuted,
    lineHeight: 22,
  },
});
