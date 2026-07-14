import { StyleSheet, Text } from 'react-native';

interface AppHeaderTitleProps {
  title: string;
}

export function AppHeaderTitle({ title }: AppHeaderTitleProps) {
  return <Text style={styles.title}>{title}</Text>;
}

const styles = StyleSheet.create({
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
});
