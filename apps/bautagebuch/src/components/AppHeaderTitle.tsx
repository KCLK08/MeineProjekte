import { StyleSheet, Text, View } from 'react-native';

import { AppLogo } from './AppLogo';

interface AppHeaderTitleProps {
  title: string;
}

export function AppHeaderTitle({ title }: AppHeaderTitleProps) {
  return (
    <View style={styles.row}>
      <AppLogo size={28} />
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
});
