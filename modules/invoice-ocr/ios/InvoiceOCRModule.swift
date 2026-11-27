import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers
import Vision
import VisionKit

private final class InvoiceScannerDelegate: NSObject, VNDocumentCameraViewControllerDelegate {
  private let mediaDirectory: URL
  private let completed: (Result<[String: Any], Error>) -> Void
  private var uncommittedDirectory: URL?

  init(mediaDirectory: URL, completed: @escaping (Result<[String: Any], Error>) -> Void) {
    self.mediaDirectory = mediaDirectory
    self.completed = completed
  }

  func documentCameraViewController(
    _ controller: VNDocumentCameraViewController,
    didFinishWith scan: VNDocumentCameraScan
  ) {
    do {
      let scanId = UUID()
      let directory = mediaDirectory.appendingPathComponent("invoice-scans", isDirectory: true)
        .appendingPathComponent(scanId.uuidString, isDirectory: true)
      uncommittedDirectory = directory
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      var pages: [[String: Any]] = []

      for pageNumber in 0..<scan.pageCount {
        let image = scan.imageOfPage(at: pageNumber)
        guard let data = image.jpegData(compressionQuality: 0.92) else {
          throw NSError(domain: "InvoiceOCR", code: 2, userInfo: [NSLocalizedDescriptionKey: "Could not encode a scanned page."])
        }
        let destination = directory.appendingPathComponent("page-\(pageNumber + 1).jpg")
        try data.write(to: destination, options: .atomic)
        pages.append(["uri": destination.absoluteString, "width": image.size.width, "height": image.size.height])
      }

      DispatchQueue.main.async {
        controller.dismiss(animated: true) { self.completed(.success(["scanId": scanId.uuidString, "pages": pages])) }
      }
    } catch {
      if let uncommittedDirectory {
        try? FileManager.default.removeItem(at: uncommittedDirectory)
      }
      uncommittedDirectory = nil
      DispatchQueue.main.async {
        controller.dismiss(animated: true) { self.completed(.failure(error)) }
      }
    }
  }

  func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
    DispatchQueue.main.async {
      controller.dismiss(animated: true) {
        self.completed(.failure(NSError(domain: "InvoiceOCR", code: 3, userInfo: [NSLocalizedDescriptionKey: "Document scanning was canceled."])))
      }
    }
  }

  func documentCameraViewController(
    _ controller: VNDocumentCameraViewController,
    didFailWithError error: Error
  ) {
    DispatchQueue.main.async {
      controller.dismiss(animated: true) { self.completed(.failure(error)) }
    }
  }
}

private func backupExportError() -> NSError {
  NSError(domain: "DukaanFlowBackup", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not export the staged backup."])
}

private func managedBackupFolder(_ uri: String, cache: URL?) throws -> URL {
  let prefix = "dukaanflow-backup-"
  guard let url = URL(string: uri), url.isFileURL, let cache,
        url.lastPathComponent.hasPrefix(prefix),
        UUID(uuidString: String(url.lastPathComponent.dropFirst(prefix.count))) != nil else {
    throw backupExportError()
  }
  let resolved = url.standardizedFileURL.resolvingSymlinksInPath()
  let values = try url.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
  guard resolved.deletingLastPathComponent().path == cache.standardizedFileURL.resolvingSymlinksInPath().path,
        values.isDirectory == true, values.isSymbolicLink != true,
        FileManager.default.fileExists(atPath: resolved.appendingPathComponent("manifest.json").path) else {
    throw backupExportError()
  }
  return resolved
}

private final class BackupExportDelegate: NSObject, UIDocumentPickerDelegate {
  private let complete: (Bool) -> Void

  init(complete: @escaping (Bool) -> Void) {
    self.complete = complete
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    complete(!urls.isEmpty)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    complete(false)
  }
}

public final class InvoiceOCRModule: Module {
  private var activeScanner: VNDocumentCameraViewController?
  private var scannerDelegate: InvoiceScannerDelegate?
  private var scanPromise: Promise?
  private var backupExportDelegate: BackupExportDelegate?
  private var backupImportDelegate: BackupImportDelegate?

  public func definition() -> ModuleDefinition {
    Name("InvoiceOCR")

    AsyncFunction("activateBackupWorkspace") { (generationId: String) throws in
      guard let documents = self.appContext?.config.documentDirectory else { throw backupExportError() }
      try activateWorkspace(documents, generationId: generationId)
    }

    AsyncFunction("archiveBackupFolder") { (uri: String) throws -> String in
      let folder = try managedBackupFolder(uri, cache: self.appContext?.config.cacheDirectory)
      let archive = folder.appendingPathComponent("\(folder.lastPathComponent).zip")
      var coordinationError: NSError?
      var copyError: Error?
      NSFileCoordinator().coordinate(readingItemAt: folder, options: .forUploading, error: &coordinationError) { zipped in
        do {
          try FileManager.default.copyItem(at: zipped, to: archive)
        } catch {
          copyError = error
        }
      }
      if let error = coordinationError { throw error }
      if let error = copyError { throw error }
      guard FileManager.default.fileExists(atPath: archive.path) else { throw backupExportError() }
      return archive.absoluteString
    }

    AsyncFunction("exportBackupArchive") { (uri: String, promise: Promise) in
      do {
        guard let url = URL(string: uri), url.isFileURL else { throw backupExportError() }
        let folder = try managedBackupFolder(url.deletingLastPathComponent().absoluteString, cache: self.appContext?.config.cacheDirectory)
        let archive = folder.appendingPathComponent("\(folder.lastPathComponent).zip")
        let resource = try archive.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        guard url.standardizedFileURL.path == archive.path,
              resource.isRegularFile == true, resource.isSymbolicLink != true,
              self.backupExportDelegate == nil,
              let presenter = self.appContext?.utilities?.currentViewController() else { throw backupExportError() }
        let picker = UIDocumentPickerViewController(forExporting: [archive], asCopy: true)
        picker.isModalInPresentation = true
        let delegate = BackupExportDelegate { [weak self] saved in
          self?.backupExportDelegate = nil
          promise.resolve(saved)
        }
        self.backupExportDelegate = delegate
        picker.delegate = delegate
        presenter.present(picker, animated: true)
      } catch {
        promise.reject("ERR_BACKUP_EXPORT", error.localizedDescription)
      }
    }.runOnQueue(.main)

    AsyncFunction("pickBackupArchive") { (promise: Promise) in
      guard self.backupImportDelegate == nil,
            let cache = self.appContext?.config.cacheDirectory,
            let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("ERR_BACKUP_IMPORT", "Could not open Files.")
        return
      }
      let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.zip], asCopy: false)
      picker.isModalInPresentation = true
      picker.allowsMultipleSelection = false
      let delegate = BackupImportDelegate { [weak self] source in
        self?.backupImportDelegate = nil
        guard let source else {
          promise.resolve(nil)
          return
        }
        DispatchQueue.global(qos: .userInitiated).async {
          let scoped = source.startAccessingSecurityScopedResource()
          defer { if scoped { source.stopAccessingSecurityScopedResource() } }
          do {
            var coordinationError: NSError?
            var result: Result<URL, Error>?
            NSFileCoordinator().coordinate(readingItemAt: source, options: [], error: &coordinationError) { coordinatedURL in
              result = Result { try unpackBackup(coordinatedURL, cache: cache) }
            }
            if let coordinationError { throw coordinationError }
            guard let result else { throw backupExportError() }
            promise.resolve(try result.get().absoluteString)
          } catch {
            promise.reject("ERR_BACKUP_IMPORT", error.localizedDescription)
          }
        }
      }
      self.backupImportDelegate = delegate
      picker.delegate = delegate
      presenter.present(picker, animated: true)
    }.runOnQueue(.main)

    AsyncFunction("recognizeImage") { (uri: String) throws -> [String: Any] in
      guard let url = URL(string: uri), url.isFileURL else {
        throw NSError(
          domain: "InvoiceOCR",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: "Expected a local file:// image URI."]
        )
      }

      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true

      let handler = VNImageRequestHandler(url: url, options: [:])
      try handler.perform([request])

      let blocks: [[String: Any]] = (request.results ?? []).compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let bounds = observation.boundingBox
        return [
          "text": candidate.string,
          "confidence": Double(candidate.confidence),
          "bounds": [
            "x": Double(bounds.origin.x),
            "y": Double(bounds.origin.y),
            "width": Double(bounds.size.width),
            "height": Double(bounds.size.height)
          ]
        ]
      }

      return ["text": blocks.map { $0["text"] as? String ?? "" }.joined(separator: "\n"), "blocks": blocks]
    }

    AsyncFunction("deleteInvoiceScan") { (scanId: String) throws in
      guard let id = UUID(uuidString: scanId), id.uuidString.caseInsensitiveCompare(scanId) == .orderedSame else {
        throw NSError(domain: "InvoiceOCR", code: 4, userInfo: [NSLocalizedDescriptionKey: "Expected an invoice scan identifier."])
      }
      guard let documents = self.appContext?.config.documentDirectory else { throw backupExportError() }
      let root = try workspaceMediaDirectory(documents).appendingPathComponent("invoice-scans", isDirectory: true).standardizedFileURL
      let directory = root.appendingPathComponent(id.uuidString, isDirectory: true).standardizedFileURL
      guard directory.deletingLastPathComponent() == root else {
        throw NSError(domain: "InvoiceOCR", code: 5, userInfo: [NSLocalizedDescriptionKey: "Invalid invoice scan location."])
      }
      var isDirectory: ObjCBool = false
      guard FileManager.default.fileExists(atPath: directory.path, isDirectory: &isDirectory) else { return }
      let values = try directory.resourceValues(forKeys: [.isSymbolicLinkKey])
      guard isDirectory.boolValue, values.isSymbolicLink != true else {
        throw NSError(domain: "InvoiceOCR", code: 6, userInfo: [NSLocalizedDescriptionKey: "The invoice scan is not a managed scan directory."])
      }
      try FileManager.default.removeItem(at: directory)
    }.runOnQueue(.main)

    AsyncFunction("scanInvoice") { (promise: Promise) in
      guard VNDocumentCameraViewController.isSupported else {
        promise.reject("ERR_SCANNER_UNAVAILABLE", "Document scanning is not supported on this device.")
        return
      }
      guard self.activeScanner == nil else {
        promise.reject("ERR_SCANNER_BUSY", "A document scan is already in progress.")
        return
      }
      guard let context = self.appContext, let documents = context.config.documentDirectory,
            let presenter = context.utilities?.currentViewController() else {
        promise.reject("ERR_NO_VIEW_CONTROLLER", "Could not present the document scanner.")
        return
      }

      guard let mediaDirectory = try? workspaceMediaDirectory(documents) else {
        promise.reject("ERR_SCAN_FAILED", "Could not open the workspace media directory.")
        return
      }
      let scanner = VNDocumentCameraViewController()
      let delegate = InvoiceScannerDelegate(mediaDirectory: mediaDirectory) { [weak self] result in
        switch result {
        case .success(let scan):
          self?.scanPromise?.resolve(scan)
        case .failure(let error):
          let code = (error as NSError).code == 3 ? "ERR_SCAN_CANCELED" : "ERR_SCAN_FAILED"
          self?.scanPromise?.reject(code, error.localizedDescription)
        }
        self?.clearScannerState()
      }
      scanner.delegate = delegate
      self.scanPromise = promise
      self.activeScanner = scanner
      self.scannerDelegate = delegate
      presenter.present(scanner, animated: true)
    }.runOnQueue(.main)
  }

  private func clearScannerState() {
    scanPromise = nil
    activeScanner = nil
    scannerDelegate = nil
  }
}
