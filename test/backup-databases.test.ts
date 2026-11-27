import assert from 'node:assert/strict';
import { copyFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import type { BackupManifest } from '../src/backup-package.ts';

test('quarantine matches restored schemas, shops, and attachment references without switching the live store', async (t) => {
  const work = await mkdtemp(join(tmpdir(), 'dukaanflow-restore-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  process.env.DUKAANFLOW_TEST_DB_PATH = join(work, 'dukaanflow.db');
  const store = await import('../src/store.ts');
  const first = await store.createShopProfile('First shop');
  const second = await store.createShopProfile('Second shop');
  const photo = 'product-photos/product-6F9619FF-8B86-D011-B42D-00C04FC964FF.jpg';
  await store.saveCatalogItem('live', {
    name: 'Rice', packSize: '1 kg', unit: 'kg', aliases: ['chawal'],
    imageUri: 'file:///old-container/Documents/' + photo,
  });

  const folder = join(work, 'databases');
  await mkdir(folder);
  const snapshots = await store.snapshotShopDatabases(folder);
  const fingerprint = { bytes: 1, md5: '0'.repeat(32) };
  const manifest: BackupManifest = {
    format: 'dukaanflow-backup', version: 1, createdAt: new Date().toISOString(),
    databases: snapshots.map(({ filename, shopId, registry }) => ({ path: 'databases/' + filename, shopId, registry, ...fingerprint })),
    media: [{ path: 'media/' + photo, ...fingerprint }],
  };
  await store.inspectBackupDatabases(folder, manifest);
  assert.equal(await store.readActiveShopId(), second.id);
  assert.equal((await store.listCatalog('live'))[0]?.name, 'Rice');
  await assert.rejects(store.inspectBackupDatabases(folder, { ...manifest, media: [] }), /attachment metadata/u);
  await assert.rejects(store.inspectBackupDatabases(folder, {
    ...manifest, databases: manifest.databases.filter(({ shopId }) => shopId === first.id),
  }), /registry does not match/u);

  const restored = join(work, 'restored');
  await mkdir(restored);
  for (const { filename, shopId, registry } of snapshots) {
    const databaseName = registry ? 'dukaanflow.db' : `dukaanflow-shop-${shopId}.db`;
    await copyFile(join(folder, filename), join(restored, databaseName));
  }
  await store.saveCatalogItem('live', { name: 'Only in original', packSize: '1 kg', unit: 'kg', aliases: [] });
  store.setStoreDirectory(restored);
  try {
    assert.equal(await store.readActiveShopId(), second.id);
    assert.deepEqual((await store.listCatalog('live')).map(({ name }) => name), ['Rice']);
    await store.saveCatalogItem('live', { name: 'Only in restore', packSize: '1 kg', unit: 'kg', aliases: [] });
    assert.deepEqual((await store.listCatalog('live')).map(({ name }) => name), ['Only in restore', 'Rice']);
  } finally {
    store.setStoreDirectory(undefined);
  }
  assert.deepEqual((await store.listCatalog('live')).map(({ name }) => name), ['Only in original', 'Rice']);

  const rewritten = new DatabaseSync(join(folder, snapshots[1].filename));
  const table = rewritten.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'catalogue_item'").get() as { sql: string };
  rewritten.exec('PRAGMA writable_schema = ON');
  rewritten.prepare("UPDATE sqlite_schema SET sql = ? WHERE type = 'table' AND name = 'catalogue_item'").run(table.sql.replace(/\s+/gu, ' '));
  rewritten.exec('PRAGMA writable_schema = OFF');
  rewritten.close();
  await store.inspectBackupDatabases(folder, manifest);

  const incompatible = new DatabaseSync(join(folder, snapshots[1].filename));
  incompatible.exec('PRAGMA writable_schema = ON');
  incompatible.prepare("UPDATE sqlite_schema SET sql = replace(sql, ?, ?) WHERE type = 'table' AND name = 'catalogue_item'").run("'packet'", "'pack'");
  incompatible.exec('PRAGMA writable_schema = OFF');
  incompatible.close();
  await assert.rejects(store.inspectBackupDatabases(folder, manifest), /schema is unsupported/u, 'Canonicalization must preserve schema literals');

  const restoreSchema = new DatabaseSync(join(folder, snapshots[1].filename));
  restoreSchema.exec('PRAGMA writable_schema = ON');
  restoreSchema.prepare("UPDATE sqlite_schema SET sql = ? WHERE type = 'table' AND name = 'catalogue_item'").run(table.sql.replace(/\s+/gu, ' '));
  restoreSchema.exec('PRAGMA writable_schema = OFF');
  restoreSchema.close();

  const modified = new DatabaseSync(join(folder, snapshots[1].filename));
  modified.exec('CREATE VIEW unexpected AS SELECT 1 AS value');
  modified.close();
  await assert.rejects(store.inspectBackupDatabases(folder, manifest), /schema is unsupported/u);
  assert.equal(await store.readActiveShopId(), second.id);
});
