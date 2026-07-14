import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DropdownSelect } from './DropdownSelect';
import { colors } from '@/theme/colors';
import { ui } from '@/theme/ui';
import type { SetupField } from '@/types';
import { normalizeClockTime } from '@/lib/time-format';

interface FieldInputProps {
  field: SetupField;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
  onFocus?: () => void;
  compact?: boolean;
}

export function FieldInput({ field, value, onChange, onFocus, compact = false }: FieldInputProps) {
  const label = field.label || field.fieldName;
  const required = field.required && !field.skipped;

  if (field.type === 'checkbox') {
    const checked = value === true;
    return (
      <Pressable style={[styles.checkboxRow, compact && styles.compact]} onPress={() => onChange(!checked)}>
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <View style={styles.labelWrap}>
          <Text style={styles.label}>{label}</Text>
          {required ? <Text style={styles.required}>Pflichtfeld</Text> : null}
        </View>
      </Pressable>
    );
  }

  if (field.type === 'dropdown' && field.options.length > 0) {
    return (
      <DropdownSelect
        label={label}
        value={String(value ?? '')}
        options={field.options}
        onChange={onChange}
        required={required}
      />
    );
  }

  const isMultiline = ['Text63', 'Text64', 'Text66', 'Text67', 'Text70'].includes(field.fieldName);

  return (
    <View style={[styles.block, compact && styles.compact]}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.requiredStar}> *</Text> : null}
      </Text>
      <TextInput
        style={[styles.input, isMultiline && styles.multiline]}
        value={String(value ?? '')}
        onChangeText={(text) => {
          const isTimeField = field.fieldName && ['Text21', 'Text22', 'Text23', 'Text24'].some((n) => field.fieldName.includes(n));
          onChange(isTimeField ? normalizeClockTime(text) : text);
        }}
        onFocus={onFocus}
        multiline={isMultiline}
        placeholder={`${label} eingeben`}
        placeholderTextColor={colors.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: ui.spacing.md,
  },
  compact: {
    marginBottom: ui.spacing.sm,
  },
  checkboxRow: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: ui.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: ui.spacing.md,
    padding: ui.spacing.sm,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 4,
    borderWidth: 2,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  labelWrap: {
    flex: 1,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  required: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  requiredStar: {
    color: colors.danger,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: ui.radius.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  multiline: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
});
