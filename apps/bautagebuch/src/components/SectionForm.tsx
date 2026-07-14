import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { DropdownSelect } from './DropdownSelect';
import { FieldInput } from './FieldInput';
import { GewerkSelector } from './GewerkSelector';
import { PhotoDocEditor } from './PhotoDocEditor';
import { ShiftSelector } from './ShiftSelector';
import { colors } from '@/theme/colors';
import { ui } from '@/theme/ui';
import type { PhotoDoc, RunSection } from '@/types';
import { inputKeyForCell, inputKeyForField } from '@/lib/setup-model';
import { getVisibleRowCount, isGewerkFieldName, isShiftFieldName, tableRowCountKey } from '@/lib/run-utils';
import { normalizeClockTime } from '@/lib/time-format';

interface SectionFormProps {
  section: RunSection;
  values: Record<string, string | boolean>;
  photoDoc: PhotoDoc;
  onValueChange: (key: string, value: string | boolean) => void;
  onValuesPatch?: (patch: Record<string, string | boolean>) => void;
  onPhotoDocChange: (photoDoc: PhotoDoc) => void;
  onWeatherSync?: () => void;
  weatherSyncBusy?: boolean;
}

export function SectionForm({
  section,
  values,
  photoDoc,
  onValueChange,
  onValuesPatch,
  onPhotoDocChange,
  onWeatherSync,
  weatherSyncBusy = false,
}: SectionFormProps) {
  if (section.kind === 'photo-doc') {
    return <PhotoDocEditor photoDoc={photoDoc} onChange={onPhotoDocChange} />;
  }

  if (section.kind === 'single') {
    const fields = (section.fields || []).filter((field) => !field.skipped);
    const isHeader = section.sectionId === 'single:header';

    function applyPatch(patch: Record<string, string | boolean>) {
      if (onValuesPatch) {
        onValuesPatch(patch);
        return;
      }
      for (const [key, value] of Object.entries(patch)) {
        onValueChange(key, value);
      }
    }

    return (
      <View>
        {section.sectionId === 'single:weather' && onWeatherSync ? (
          <Pressable style={styles.weatherButton} onPress={onWeatherSync} disabled={weatherSyncBusy}>
            <Ionicons name="cloud-download-outline" size={18} color={colors.primary} />
            <Text style={styles.weatherButtonText}>{weatherSyncBusy ? 'Wetter wird geladen…' : 'Wetter automatisch laden'}</Text>
          </Pressable>
        ) : null}

        {isHeader ? <ShiftSelector fields={fields} values={values} onChange={applyPatch} /> : null}
        {isHeader ? <GewerkSelector fields={fields} values={values} onChange={applyPatch} /> : null}

        {fields
          .filter((field) => !isHeader || (!isShiftFieldName(field.fieldName) && !isGewerkFieldName(field.fieldName)))
          .map((field) => {
            const key = inputKeyForField(field);
            return (
              <FieldInput
                key={key}
                field={field}
                value={values[key] as string | boolean | undefined}
                onChange={(value) => onValueChange(key, value)}
              />
            );
          })}
      </View>
    );
  }

  if (section.kind === 'table') {
    const tableId = section.tableId || '';
    const rows = section.rows || [];
    const visibleCount = getVisibleRowCount(tableId, values, rows.length);
    const visibleRows = rows.slice(0, visibleCount);

    return (
      <View>
        {visibleRows.map((row) => (
          <View key={row.rowId} style={styles.tableRow}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowTitle}>Zeile {row.index}</Text>
              <Text style={styles.rowHint}>Eintrag {row.index}</Text>
            </View>
            {(row.cells || [])
              .filter((cell) => !cell.skipped)
              .map((cell) => {
                const key = inputKeyForCell(cell);
                const column = (section.columns || []).find((c) => c.columnId === cell.columnId);
                const label = column?.label || cell.label;
                const isTime = tableId === 'table_main_personal' && ['c2', 'c3'].includes(cell.columnId);
                return (
                  <FieldInput
                    key={key}
                    field={{ ...cell, label }}
                    value={values[key] as string | boolean | undefined}
                    onChange={(value) => onValueChange(key, isTime ? normalizeClockTime(String(value)) : value)}
                    compact
                  />
                );
              })}
          </View>
        ))}

        <View style={styles.rowActions}>
          {visibleCount < rows.length ? (
            <Pressable
              style={styles.rowButton}
              onPress={() => onValueChange(tableRowCountKey(tableId), String(visibleCount + 1))}
            >
              <Text style={styles.rowButtonText}>+ Zeile hinzufügen</Text>
            </Pressable>
          ) : null}
          {visibleCount > 1 ? (
            <Pressable
              style={[styles.rowButton, styles.rowButtonSecondary]}
              onPress={() => onValueChange(tableRowCountKey(tableId), String(visibleCount - 1))}
            >
              <Text style={[styles.rowButtonText, styles.rowButtonTextSecondary]}>Zeile entfernen</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  weatherButton: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: ui.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: ui.spacing.md,
    paddingVertical: 14,
  },
  weatherButtonText: {
    color: colors.primary,
    fontWeight: '700',
  },
  tableRow: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: ui.radius.md,
    borderWidth: 1,
    marginBottom: ui.spacing.md,
    padding: ui.spacing.md,
    ...ui.shadow.card,
  },
  rowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: ui.spacing.sm,
  },
  rowTitle: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '800',
  },
  rowHint: {
    color: colors.textMuted,
    fontSize: 12,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 10,
  },
  rowButton: {
    backgroundColor: colors.primary,
    borderRadius: ui.radius.sm,
    flex: 1,
    paddingVertical: 12,
  },
  rowButtonSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  rowButtonText: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
  },
  rowButtonTextSecondary: {
    color: colors.textMuted,
  },
});
