import { validateStagedBackup, type BackupFiles, type BackupManifest } from './backup-package.ts';

const GENERATION_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;

export function restoreGenerationPaths(documentsDirectory: string, id: string) {
  if (!documentsDirectory.startsWith('file:///') || !GENERATION_ID.test(id)) {
    throw new Error('Invalid restore generation.');
  }
  const root = `${documentsDirectory.replace(/\/*$/u, '/')}dukaanflow-workspaces/${id}/`;
  return { root, sqliteDirectory: `${root}SQLite/`, mediaDirectory: `${root}media/` };
}

/** Materialize a verified package in a new directory. No active store pointer is changed. */
export async function stageRestoreGeneration(
  quarantine: string,
  documentsDirectory: string,
  id: string,
  manifest: BackupManifest,
  files: BackupFiles & { makeExclusiveDirectory: (uri: string) => Promise<void> },
) {
  const source = quarantine.replace(/\/*$/u, '/');
  const generation = restoreGenerationPaths(documentsDirectory, id);
  const checked = await validateStagedBackup(source, JSON.stringify(manifest), files.fingerprint);
  await files.makeDirectory(`${documentsDirectory.replace(/\/*$/u, '/')}dukaanflow-workspaces/`);
  await files.makeExclusiveDirectory(generation.root);
  try {
    await files.makeDirectory(generation.sqliteDirectory);
    await files.makeDirectory(generation.mediaDirectory);

    for (const entry of checked.databases) {
      const filename = entry.registry ? 'dukaanflow.db' : `dukaanflow-shop-${entry.shopId}.db`;
      await copyChecked(source + entry.path, generation.sqliteDirectory + filename, entry, files);
    }
    for (const entry of checked.media) {
      const destination = generation.root + entry.path;
      await files.makeDirectory(destination.slice(0, destination.lastIndexOf('/') + 1));
      await copyChecked(source + entry.path, destination, entry, files);
    }
    await files.writeText(generation.root + 'manifest.json', JSON.stringify(checked));
    return generation;
  } catch (error) {
    await files.removeDirectory(generation.root);
    throw error;
  }
}

async function copyChecked(source: string, destination: string, expected: { bytes: number; md5: string }, files: BackupFiles) {
  await files.copy(source, destination);
  const actual = await files.fingerprint(destination);
  if (actual.bytes !== expected.bytes || actual.md5.toLowerCase() !== expected.md5.toLowerCase()) {
    throw new Error('A recovery file changed while staging.');
  }
}
