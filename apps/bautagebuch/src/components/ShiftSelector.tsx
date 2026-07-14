import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/theme/colors';
import { ui } from '@/theme/ui';
import type { SetupField } from '@/types';
import { inputKeyForField } from '@/lib/setup-model';
import { SHIFT_FIELD_NAMES } from '@/lib/run-utils';

interface ShiftSelectorProps {
  fields: SetupField[];
  values: Record<string, string | boolean>;
  onChange: (patch: Record<string, boolean>) => void;
}

export function ShiftSelector({ fields, values, onChange }: ShiftSelectorProps) {
  const shiftFields = SHIFT_FIELD_NAMES.map((name) => fields.find((f) => f.fieldName === name)).filter(Boolean) as SetupField[];

  if (shiftFields.length === 0) return null;

  function selectedFieldName() {
    for (const field of shiftFields) {
      if (values[inputKeyForField(field)] === true) return field.fieldName;
    }
    return '';
  }

  function toggle(field: SetupField) {
    const key = inputKeyForField(field);
    const isSelected = values[key] === true;
    const patch: Record<string, boolean> = {};
    for (const shiftField of shiftFields) {
      patch[inputKeyForField(shiftField)] = !isSelected && shiftField.fieldName === field.fieldName;
    }
    onChange(patch);
  }

  const active = selectedFieldName();

  return (
    <View style={styles.block}>
      <Text style={styles.label}>Schicht</Text>
      <View style={styles.row}>
        {shiftFields.map((field) => {
          const selected = active === field.fieldName;
          return (
            <Pressable
              key={field.fieldName}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => toggle(field)}
            >
              <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
              </View>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={2}>
                {field.label || field.fieldName}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: ui.spacing.md,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: ui.radius.sm,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  chipSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
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
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  chipTextSelected: {
    color: colors.primary,
  },
});
