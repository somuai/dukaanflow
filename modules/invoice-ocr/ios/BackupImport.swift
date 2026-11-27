import Foundation
import UIKit
import ZIPFoundation

private struct ActiveWorkspace: Codable {
  let version: Int
  let generationId: String
}

private func workspaceMarker(_ documents: URL) -> URL {
  documents.appendingPathComponent("dukaanflow-active-workspace.json")
}

private func workspaceGeneration(_ documents: URL, _ generationId: String) throws -> URL {
  guard let id = UUID(uuidString: generationId),
        id.uuidString.caseInsensitiveCompare(generationId) == .orderedSame else { throw importError() }
  return documents.appendingPathComponent("dukaanflow-workspaces", isDirectory: true)
    .appendingPathComponent(generationId, isDirectory: true)
}

func workspaceMediaDirectory(_ documents: URL) throws -> URL {
  let marker = workspaceMarker(documents)
  guard FileManager.default.fileExists(atPath: marker.path) else { return documents }
  let size = try marker.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
  guard size.isRegularFile == true, let bytes = size.fileSize, (1...256).contains(bytes) else { throw importError() }
  let active = try JSONDecoder().decode(ActiveWorkspace.self, from: Data(contentsOf: marker))
  guard active.version == 1 else { throw importError() }
  return try workspaceGeneration(documents, active.generationId).appendingPathComponent("media", isDirectory: true)
}

func activateWorkspace(_ documents: URL, generationId: String) throws {
  let root = try workspaceGeneration(documents, generationId)
  let registry = root.appendingPathComponent("SQLite/dukaanflow.db")
  let media = root.appendingPathComponent("media", isDirectory: true)
  let manifest = root.appendingPathComponent("manifest.json")
  let registryInfo = try registry.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
  guard registryInfo.isRegularFile == true, (registryInfo.fileSize ?? 0) > 0,
        try media.resourceValues(forKeys: [.isDirectoryKey]).isDirectory == true,
        try manifest.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true else { throw importError() }
  let active = ActiveWorkspace(version: 1, generationId: generationId)
  try JSONEncoder().encode(active).write(to: workspaceMarker(documents), options: .atomic)
}

final class BackupImportDelegate: NSObject, UIDocumentPickerDelegate {
  private let complete: (URL?) -> Void

  init(complete: @escaping (URL?) -> Void) {
    self.complete = complete
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    complete(urls.first)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    complete(nil)
  }
}

private func importError() -> NSError {
  NSError(domain: "DukaanFlowBackup", code: 2, userInfo: [NSLocalizedDescriptionKey: "The selected ZIP is not a supported DukaanFlow backup."])
}

func unpackBackup(_ source: URL, cache: URL) throws -> URL {
  let limit: UInt64 = 512 * 1024 * 1024
  let resource = try source.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey, .isSymbolicLinkKey])
  guard resource.isRegularFile == true, resource.isSymbolicLink != true,
        let size = resource.fileSize, size > 0, UInt64(size) <= limit else { throw importError() }
  let archive = try Archive(url: source, accessMode: .read)
  let root = cache.appendingPathComponent("dukaanflow-import-\(UUID().uuidString)", isDirectory: true)
  let manager = FileManager.default
  let uuid = "[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}"
  let allowed = try NSRegularExpression(pattern: "\\A(?:manifest\\.json|databases/snapshot-\(uuid)\\.sqlite|media/invoice-scans/\(uuid)/page-[1-9][0-9]*\\.jpg|media/product-photos/product-\(uuid)\\.jpg)\\z")
  func relativePath(_ raw: String) -> String {
    let pieces = raw.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false)
    guard pieces.count == 2, pieces[0].hasPrefix("dukaanflow-backup-"),
          UUID(uuidString: String(pieces[0].dropFirst("dukaanflow-backup-".count))) != nil else { return raw }
    return String(pieces[1])
  }

  try manager.createDirectory(at: root, withIntermediateDirectories: false)
  do {
    var seen = Set<String>()
    var total: UInt64 = 0
    var count = 0
    for entry in archive {
      count += 1
      guard count <= 20_000 else { throw importError() }
      guard entry.type != .symlink else { throw importError() }
      if entry.type == .directory || entry.path.hasPrefix("__MACOSX/") { continue }
      let path = relativePath(entry.path)
      let range = NSRange(path.startIndex..<path.endIndex, in: path)
      let expected = UInt64(entry.uncompressedSize)
      guard allowed.firstMatch(in: path, range: range) != nil,
            seen.insert(path.lowercased()).inserted,
            expected > 0, expected <= limit - total,
            path != "manifest.json" || expected <= 8_000_000 else { throw importError() }
      total += expected

      let target = root.appendingPathComponent(path)
      try manager.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
      guard manager.createFile(atPath: target.path, contents: nil) else { throw importError() }
      let output = try FileHandle(forWritingTo: target)
      defer { try? output.close() }
      var written: UInt64 = 0
      let checksum = try archive.extract(entry) { chunk in
        guard UInt64(chunk.count) <= expected - written else { throw importError() }
        try output.write(contentsOf: chunk)
        written += UInt64(chunk.count)
      }
      guard written == expected, checksum == entry.checksum else { throw importError() }
    }
    guard seen.contains("manifest.json") else { throw importError() }
    return root
  } catch {
    try? manager.removeItem(at: root)
    throw error
  }
}
