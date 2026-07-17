import ExpoModulesCore
import Foundation

/**
 * Applies NSURLIsExcludedFromBackupKey to local file URLs.
 * Never logs path strings.
 */
public class IosBackupExclusionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("IosBackupExclusion")

    Function("setExcludedFromBackup") { (uri: String) -> Bool in
      return try Self.applyExclusion(uri: uri, excluded: true)
    }

    Function("isExcludedFromBackup") { (uri: String) -> Bool in
      return try Self.readExclusion(uri: uri)
    }
  }

  private static func fileURL(from uri: String) throws -> URL {
    let trimmed = uri.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      throw Exception(name: "InvalidUri", description: "URI missing")
    }
    if let url = URL(string: trimmed), url.isFileURL {
      return url
    }
    // Absolute filesystem path fallback (no scheme)
    if trimmed.hasPrefix("/") {
      return URL(fileURLWithPath: trimmed, isDirectory: trimmed.hasSuffix("/"))
    }
    throw Exception(name: "InvalidUri", description: "Not a file URL")
  }

  private static func applyExclusion(uri: String, excluded: Bool) throws -> Bool {
    let url = try fileURL(from: uri)
    var mutable = url
    var error: NSError?
    let ok = (mutable as NSURL).setResourceValue(
      NSNumber(value: excluded),
      forKey: .isExcludedFromBackupKey,
      error: &error
    )
    if let error {
      // Do not include localized path details in the thrown message.
      throw Exception(name: "SetFailed", description: "Backup exclusion failed (\(error.code))")
    }
    return ok
  }

  private static func readExclusion(uri: String) throws -> Bool {
    let url = try fileURL(from: uri)
    var value: AnyObject?
    var error: NSError?
    let ok = (url as NSURL).getResourceValue(
      &value,
      forKey: .isExcludedFromBackupKey,
      error: &error
    )
    if let error {
      throw Exception(name: "GetFailed", description: "Backup exclusion read failed (\(error.code))")
    }
    guard ok else { return false }
    return (value as? NSNumber)?.boolValue ?? false
  }
}
