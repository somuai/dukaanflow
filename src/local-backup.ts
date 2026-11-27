import * as FileSystem from 'expo-file-system/legacy';
import { activateBackupWorkspace, exportStagedBackup, pickBackupArchive } from '../modules/invoice-ocr/src';
import { stageBackupPackage, validateStagedBackup, type BackupFiles } from './backup-package';
import { inspectBackupDatabases, newOperationId, snapshotShopDatabases } from './store';
import { readWorkspaceLocation } from './workspace-location';
import { stageRestoreGeneration } from './restore-generation';

const files: BackupFiles = {
  makeDirectory: (uri) => FileSystem.makeDirectoryAsync(uri, { intermediates: true }),
  async fingerprint(uri) {
    const info = await FileSystem.getInfoAsync(uri, { md5: true });
    if (!info.exists || info.isDirectory || !info.size || !info.md5) {
      throw new Error('A required backup file is unavailable.');
    }
    return { bytes: info.size, md5: info.md5 };
  },
  copy: (source, destination) => FileSystem.copyAsync({ from: source, to: destination }),
  writeText: (uri, value) => FileSystem.writeAsStringAsync(uri, value),
  removeDirectory: (uri) => FileSystem.deleteAsync(uri, { idempotent: true }),
};

/** Check an unpacked package isolated from the live app database directory. */
export async function inspectLocalBackup(directory: string) {
  const root = directory.replace(/\/*$/u, '/');
  const manifestURI = `${root}manifest.json`;
  const info = await FileSystem.getInfoAsync(manifestURI);
  if (!info.exists || info.isDirectory || !info.size || info.size > 8_000_000) {
    throw new Error('The backup manifest is missing or too large.');
  }
  const manifest = await validateStagedBackup(root, await FileSystem.readAsStringAsync(manifestURI), files.fingerprint);
  await inspectBackupDatabases(`${root}databases/`, manifest);
  return manifest;
}

/** Caller owns the temporary folder and removes it after the export completes. */
export async function prepareLocalBackup() {
  const { cacheDirectory } = FileSystem;
  const { mediaDirectory } = await readWorkspaceLocation();
  if (!cacheDirectory || !mediaDirectory) throw new Error('Local backup storage is unavailable.');
  const directory = `${cacheDirectory}dukaanflow-backup-${newOperationId()}/`;
  const manifest = await stageBackupPackage(directory, mediaDirectory, snapshotShopDatabases, files);
  return { directory, manifest, dispose: () => files.removeDirectory(directory) };
}

export async function exportLocalBackup(): Promise<boolean> {
  const backup = await prepareLocalBackup();
  try {
    return await exportStagedBackup(backup.directory);
  } finally {
    await backup.dispose().catch(() => {});
  }
}

export async function checkBackupArchive() {
  const directory = await pickBackupArchive();
  if (!directory) return null;
  try {
    return await inspectLocalBackup(directory);
  } finally {
    await files.removeDirectory(directory).catch(() => {});
  }
}

/** Stage and verify before changing the marker. The caller immediately reloads on success. */
export async function restoreLocalBackup(): Promise<boolean> {
  const documents = FileSystem.documentDirectory;
  if (!documents) throw new Error('Local backup storage is unavailable.');
  const directory = await pickBackupArchive();
  if (!directory) return false;
  try {
    const manifest = await inspectLocalBackup(directory);
    const generationId = newOperationId();
    const generation = await stageRestoreGeneration(directory, documents, generationId, manifest, {
      ...files,
      makeExclusiveDirectory: (uri) => FileSystem.makeDirectoryAsync(uri, { intermediates: false }),
    });
    try {
      await activateBackupWorkspace(generationId);
    } catch (error) {
      await files.removeDirectory(generation.root).catch(() => {});
      throw error;
    }
    return true;
  } finally {
    await files.removeDirectory(directory).catch(() => {});
  }
}
