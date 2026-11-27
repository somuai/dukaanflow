import * as FileSystem from 'expo-file-system/legacy';
import { restoreGenerationPaths } from './restore-generation';

export async function readWorkspaceLocation() {
  const documents = FileSystem.documentDirectory;
  if (!documents) return { sqliteDirectory: undefined, mediaDirectory: null };
  const marker = `${documents}dukaanflow-active-workspace.json`;
  const info = await FileSystem.getInfoAsync(marker);
  if (!info.exists) return { sqliteDirectory: undefined, mediaDirectory: documents };
  if (info.isDirectory || !info.size || info.size > 256) throw new Error('Invalid active workspace marker.');

  const decoded: { version?: unknown; generationId?: unknown } | null = JSON.parse(await FileSystem.readAsStringAsync(marker));
  if (!decoded || decoded.version !== 1 || typeof decoded.generationId !== 'string') throw new Error('Invalid active workspace marker.');
  const location = restoreGenerationPaths(documents, decoded.generationId);
  const registry = await FileSystem.getInfoAsync(location.sqliteDirectory + 'dukaanflow.db');
  const media = await FileSystem.getInfoAsync(location.mediaDirectory);
  if (!registry.exists || registry.isDirectory || !registry.size || !media.exists || !media.isDirectory) {
    throw new Error('The selected workspace is incomplete.');
  }
  return location;
}
