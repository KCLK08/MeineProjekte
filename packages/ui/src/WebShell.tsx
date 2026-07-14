import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, spacing } from '@meineprojekte/theme';

type Props = {
  title: string;
  /** Production URL on GitHub Pages */
  uri: string;
};

export function WebShell({ title, uri }: Props) {
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.bar}>
        <Text style={styles.title}>{title}</Text>
      </View>
      <WebView
        source={{ uri }}
        style={styles.webview}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        )}
        allowsBackForwardNavigationGestures
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  bar: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 16, fontWeight: '800', color: colors.text },
  webview: { flex: 1, backgroundColor: colors.background },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
