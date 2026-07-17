package expo.modules.iosbackupexclusion

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android stub – backup protection is handled by allowBackup=false (unchanged).
 * Methods are no-ops so JS can call Platform.OS === 'ios' only; if called, return true.
 */
class IosBackupExclusionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("IosBackupExclusion")

    Function("setExcludedFromBackup") { _: String ->
      true
    }

    Function("isExcludedFromBackup") { _: String ->
      true
    }
  }
}
