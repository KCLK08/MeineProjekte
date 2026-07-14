import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/theme/colors';
import { ui } from '@/theme/ui';
import type { SetupField } from '@/types';
import { inputKeyForField } from '@/lib/setup-model';
import { GEWERK_FIELD_NAMES, GEWERK_LABELS, getSelectedGewerkFieldName } from '@/lib/run-utils';

interface GewerkSelectorProps {
  fields: SetupField[];
  values: Record<string, string | boolean>;
  onChange: (patch: Record<string, string>) => void;
}

export function GewerkSelector({ fields, values, onChange }: GewerkSelectorProps) {
  const [open, setOpen] = useState(false);
  const gewerkFields = GEWERK_FIELD_NAMES.map((name) => fields.find((f) => f.fieldName === name)).filter(Boolean) as SetupField[];

  if (gewerkFields.length === 0) return null;

  const selectedName = getSelectedGewerkFieldName(gewerkFields, values);
  const selectedLabel = selectedName ? GEWERK_LABELS[selectedName] || selectedName : '';

  function select(fieldName: string) {
    const patch: Record<string, string> = {};
    for (const field of gewerkFields) {
      patch[inputKeyForField(field)] = field.fieldName === fieldName ? 'X' : '';
    }
    onChange(patch);
    setOpen(false);
  }

  return (
    <View style={styles.block}>
      <Text style={styles.label}>Gewerk</Text>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={[styles.triggerText, !selectedLabel && styles.placeholder]} numberOfLines={2}>
          {selectedLabel || 'Gewerk auswählen'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Gewerk auswählen</Text>
            <Text style={styles.sheetHint}>Im PDF wird automatisch ein „X“ im gewählten Feld gesetzt.</Text>
            <ScrollView style={styles.optionScroll}>
              {gewerkFields.map((field) => {
                const selected = selectedName === field.fieldName;
                const label = GEWERK_LABELS[field.fieldName] || field.label || field.fieldName;
                return (
                  <Pressable
                    key={field.fieldName}
                    style={[styles.option, selected && styles.optionSelected]}
                    onPress={() => select(field.fieldName)}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
                    {selected ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
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
    marginBottom: 6,
  },
  trigger: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: ui.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  triggerText: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    paddingRight: 8,
  },
  placeholder: {
    color: colors.textMuted,
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: ui.radius.lg,
    borderTopRightRadius: ui.radius.lg,
    maxHeight: '70%',
    paddingBottom: 24,
    paddingHorizontal: ui.spacing.md,
    paddingTop: ui.spacing.md,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  sheetHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
    marginTop: 4,
  },
  optionScroll: {
    maxHeight: 360,
  },
  option: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  optionSelected: {
    backgroundColor: colors.primarySoft,
  },
  optionText: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
  },
  optionTextSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
});
