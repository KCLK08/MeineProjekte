import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { ui } from '@/theme/ui';

export function StatusBadge({ state }: { state: 'done' | 'progress' | 'todo' }) {
  const label = state === 'done' ? 'Fertig' : state === 'progress' ? 'In Arbeit' : 'Offen';
  const backgroundColor = state === 'done' ? colors.done : state === 'progress' ? colors.progress : colors.todo;

  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: ui.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
