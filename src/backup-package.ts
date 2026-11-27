import { resolveSavedInvoicePage, resolveSavedProductPhoto } from './invoice-evidence.ts';

type DatabaseSnapshot = {
  filename: string;
  registry: boolean;
  shopId: string | null;
  attachments: { invoices: unknown[]; products: string[] };
};
type FileFingerprint = { bytes: number; md5: string };
type BackupDatabase = FileFingerprint & { path: string; registry: boolean; shopId: string | null };
type BackupMedia = FileFingerprint & { path: string };
export type BackupManifest = {
  format: 'dukaanflow-backup'; version: 1; createdAt: string;
  databases: BackupDatabase[]; media: BackupMedia[];
};

export function managedAttachmentPaths(
  attachments: DatabaseSnapshot['attachments'],
  documentsDirectory: string,
): string[] {
  const documents = documentsDirectory.replace(/\/*$/u, '/');
  return [
    ...attachments.invoices.map((reference) => resolveSavedInvoicePage(reference, documents)),
    ...attachments.products.map((reference) => resolveSavedProductPhoto(reference, documents)),
  ].map((uri) => {
    if (!uri) throw new Error('A saved attachment is outside the managed media folders.');
    return uri.slice(documents.length);
  });
}
export type BackupFiles = {
  makeDirectory: (uri: string) => Promise<void>;
  fingerprint: (uri: string) => Promise<FileFingerprint>;
  copy: (source: string, destination: string) => Promise<void>;
  writeText: (uri: string, value: string) => Promise<void>;
  removeDirectory: (uri: string) => Promise<void>;
};

/** Build one local recovery folder. A manifest is written only after every file is verified. */
export async function stageBackupPackage(
  directory: string,
  documentsDirectory: string,
  snapshot: (directory: string) => Promise<DatabaseSnapshot[]>,
  files: BackupFiles,
) {
  const root = directory.replace(/\/*$/u, '/');
  const documents = documentsDirectory.replace(/\/*$/u, '/');
  const databaseDirectory = `${root}databases/`;
  if (!directory || !documentsDirectory || root === documents) throw new Error('Invalid backup directories.');

  await files.makeDirectory(root);
  try {
    await files.makeDirectory(databaseDirectory);
    const snapshots = await snapshot(databaseDirectory);
    if (snapshots.filter((entry) => entry.registry).length !== 1) throw new Error('Expected one shop registry snapshot.');

    const databases = [];
    const mediaPaths = new Set<string>();
    for (const entry of snapshots) {
      if (!/^snapshot-[0-9a-f-]+\.sqlite$/iu.test(entry.filename)) throw new Error('Invalid snapshot filename.');
      const path = `databases/${entry.filename}`;
      databases.push({
        path, registry: entry.registry, shopId: entry.shopId, ...await files.fingerprint(root + path),
      });
      for (const path of managedAttachmentPaths(entry.attachments, documents)) mediaPaths.add(path);
    }

    const media = [];
    for (const relative of [...mediaPaths].sort()) {
      const source = documents + relative;
      const path = `media/${relative}`;
      const target = root + path;
      const original = await files.fingerprint(source);
      await files.makeDirectory(target.slice(0, target.lastIndexOf('/') + 1));
      await files.copy(source, target);
      const copied = await files.fingerprint(target);
      if (original.bytes !== copied.bytes || original.md5 !== copied.md5) {
        throw new Error('A saved attachment changed during backup.');
      }
      media.push({ path, ...copied });
    }

    const manifest: BackupManifest = { format: 'dukaanflow-backup', version: 1, createdAt: new Date().toISOString(), databases, media };
    await files.writeText(`${root}manifest.json`, JSON.stringify(manifest, null, 2));
    return manifest;
  } catch (error) {
    await files.removeDirectory(root);
    throw error;
  }
}

export const BACKUP_DATABASE_PATH = /^databases\/snapshot-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.sqlite$/iu;
const SHOP_ID = /^[a-zA-Z0-9_-]{1,80}$/u;

function fingerprintIsValid(file: Record<string, unknown>): file is Record<string, unknown> & FileFingerprint {
  return typeof file.bytes === 'number' && Number.isSafeInteger(file.bytes) && file.bytes > 0
    && typeof file.md5 === 'string' && /^[a-f0-9]{32}$/iu.test(file.md5);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid backup manifest.');
  return value as Record<string, unknown>;
}

/** Validates an unpacked backup in quarantine without opening or modifying the live store. */
export async function validateStagedBackup(
  directory: string,
  manifestText: string,
  fingerprint: BackupFiles['fingerprint'],
): Promise<BackupManifest> {
  if (!directory.startsWith('file:///') || manifestText.length > 8_000_000) throw new Error('Invalid backup staging input.');
  const manifest = record(JSON.parse(manifestText));
  if (manifest.format !== 'dukaanflow-backup' || manifest.version !== 1
    || typeof manifest.createdAt !== 'string' || !Number.isFinite(Date.parse(manifest.createdAt))
    || !Array.isArray(manifest.databases) || !Array.isArray(manifest.media)) {
    throw new Error('Unsupported backup manifest.');
  }

  const paths = new Set<string>();
  const shopIds = new Set<string>();
  const databases: BackupDatabase[] = manifest.databases.map((value) => {
    const file = record(value);
    if (typeof file.path !== 'string' || !BACKUP_DATABASE_PATH.test(file.path) || !fingerprintIsValid(file)
      || typeof file.registry !== 'boolean'
      || (file.shopId !== null && (typeof file.shopId !== 'string' || !SHOP_ID.test(file.shopId)))
      || (file.registry ? file.shopId !== null && file.shopId !== 'default' : file.shopId === null || file.shopId === 'default')) {
      throw new Error('Invalid database in backup manifest.');
    }
    if (file.shopId !== null) {
      if (shopIds.has(file.shopId.toLowerCase())) throw new Error('Duplicate shop in backup manifest.');
      shopIds.add(file.shopId.toLowerCase());
    }
    return { path: file.path, bytes: file.bytes, md5: file.md5, registry: file.registry, shopId: file.shopId };
  });
  if (databases.filter(({ registry }) => registry).length !== 1) throw new Error('Expected one shop registry snapshot.');

  const root = directory.replace(/\/*$/u, '/');
  const media: BackupMedia[] = manifest.media.map((value) => {
    const file = record(value);
    if (typeof file.path !== 'string' || !file.path.startsWith('media/') || !fingerprintIsValid(file)) {
      throw new Error('Invalid attachment in backup manifest.');
    }
    const relative = file.path.slice('media/'.length);
    if (resolveSavedInvoicePage(relative, root) !== root + relative
      && resolveSavedProductPhoto(relative, root) !== root + relative) throw new Error('Invalid attachment path.');
    return { path: file.path, bytes: file.bytes, md5: file.md5 };
  });

  const entries = [...databases, ...media];
  for (const file of entries) {
    const key = file.path.toLowerCase();
    if (paths.has(key)) throw new Error('Duplicate path in backup manifest.');
    paths.add(key);
  }
  for (const file of entries) {
    const actual = await fingerprint(root + file.path);
    if (actual.bytes !== file.bytes || actual.md5.toLowerCase() !== file.md5.toLowerCase()) {
      throw new Error('A backup file did not match its recorded checksum.');
    }
  }
  return { format: 'dukaanflow-backup', version: 1, createdAt: manifest.createdAt, databases, media };
}
