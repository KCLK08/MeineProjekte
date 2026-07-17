import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, spacing } from '@meineprojekte/theme';

type Props = {
  title: string;
  /** Remote web URL when hosted; empty = kein öffentliches Hosting */
  uri: string;
};

export function WebShell({ title, uri }: Props) {
  const hasUri = Boolean(uri?.trim());

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.bar}>
        <Text style={styles.title}>{title}</Text>
      </View>
      {hasUri ? (
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
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Kein Web-Hosting</Text>
          <Text style={styles.placeholderBody}>
            In diesem Repo gibt es kein öffentliches Web-Hosting. Die Web-App lokal starten bzw.
            unter dem jeweiligen apps/*/web/-Ordner öffnen.
          </Text>
        </View>
      )}
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
  placeholder: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.sm,
  },
  placeholderTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  placeholderBody: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
});
