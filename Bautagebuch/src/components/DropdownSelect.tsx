import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/theme/colors';
import { ui } from '@/theme/ui';

interface DropdownSelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}

export function DropdownSelect({
  label,
  value,
  options,
  onChange,
  required = false,
  placeholder = 'Bitte auswählen',
}: DropdownSelectProps) {
  const [open, setOpen] = useState(false);
  const displayValue = String(value || '').trim();

  return (
    <View style={styles.block}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.requiredStar}> *</Text> : null}
      </Text>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={[styles.triggerText, !displayValue && styles.placeholder]} numberOfLines={1}>
          {displayValue || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <ScrollView style={styles.optionScroll}>
              {options.map((option) => {
                const selected = displayValue === option;
                return (
                  <Pressable
                    key={option}
                    style={[styles.option, selected && styles.optionSelected]}
                    onPress={() => {
                      onChange(option);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option}</Text>
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
  requiredStar: {
    color: colors.danger,
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
    marginBottom: 12,
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
