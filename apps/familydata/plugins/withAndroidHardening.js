const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Forces backup disabled in the merged AndroidManifest.
 * Complements app.json android.allowBackup=false.
 */
function withAndroidHardening(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application?.$) {
      application.$['android:allowBackup'] = 'false';
      application.$['android:fullBackupOnly'] = 'false';
      // Empty backup rules / no cloud backup of app data.
      delete application.$['android:fullBackupContent'];
      delete application.$['android:dataExtractionRules'];
    }
    return cfg;
  });
}

module.exports = withAndroidHardening;
