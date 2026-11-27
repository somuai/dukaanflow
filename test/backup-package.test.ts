import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { stageBackupPackage, validateStagedBackup, type BackupFiles } from '../src/backup-package.ts';
import { stageRestoreGeneration } from '../src/restore-generation.ts';

test('recovery staging copies unique managed media and removes incomplete packages', async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'dukaanflow-package-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const uri = (name: string) => pathToFileURL(join(temporary, name)).href;
  const files: BackupFiles = {
    makeDirectory: async (path) => { await mkdir(new URL(path), { recursive: true }); },
    async fingerprint(path) {
      const contents = await readFile(new URL(path));
      return { bytes: contents.length, md5: createHash('md5').update(contents).digest('hex') };
    },
    copy: (source, destination) => copyFile(new URL(source), new URL(destination)),
    writeText: (path, contents) => writeFile(new URL(path), contents),
    removeDirectory: (path) => rm(new URL(path), { recursive: true, force: true }),
  };
  const page = 'invoice-scans/6F9619FF-8B86-D011-B42D-00C04FC964FF/page-1.jpg';
  const photo = 'product-photos/product-6F9619FF-8B86-D011-B42D-00C04FC964FF.jpg';
  const filename = 'snapshot-6F9619FF-8B86-D011-B42D-00C04FC964FF.sqlite';
  await files.makeDirectory(uri('Documents/' + page.slice(0, page.lastIndexOf('/'))));
  await files.makeDirectory(uri('Documents/product-photos'));
  await files.writeText(uri('Documents/' + page), 'invoice fixture');
  await files.writeText(uri('Documents/' + photo), 'photo fixture');
  const snapshot = async (directory: string) => {
    await files.writeText(directory + filename, 'database fixture');
    return [{ filename, registry: true, shopId: 'default', attachments: {
      invoices: [page, 'file:///old-container/Documents/' + page], products: [photo],
    } }];
  };
  const manifest = await stageBackupPackage(uri('complete'), uri('Documents'), snapshot, files);
  assert.deepEqual(manifest.media.map(({ path }) => path), ['media/' + page, 'media/' + photo]);
  assert.equal(await readFile(join(temporary, 'complete', 'media', page), 'utf8'), 'invoice fixture');
  assert.equal(await readFile(join(temporary, 'complete', 'media', photo), 'utf8'), 'photo fixture');
  assert.deepEqual(JSON.parse(await readFile(join(temporary, 'complete', 'manifest.json'), 'utf8')), manifest);
  assert.deepEqual(await validateStagedBackup(uri('complete'), JSON.stringify(manifest), files.fingerprint), manifest);
  const activeDatabase = uri('Documents/dukaanflow.db');
  await files.writeText(activeDatabase, 'active ledger');
  const generationId = 'A85098D2-EA2B-4798-BA39-72C7333CAE9A';
  const restoreFiles = {
    ...files,
    makeExclusiveDirectory: async (path: string) => { await mkdir(new URL(path)); },
  };
  const restored = await stageRestoreGeneration(uri('complete'), uri('Documents'), generationId, manifest, restoreFiles);
  assert.equal(await readFile(new URL(restored.sqliteDirectory + 'dukaanflow.db'), 'utf8'), 'database fixture');
  assert.equal(await readFile(new URL(restored.mediaDirectory + page), 'utf8'), 'invoice fixture');
  await assert.rejects(stageRestoreGeneration(uri('complete'), uri('Documents'), generationId, manifest, restoreFiles), /EEXIST/u);
  assert.equal(await readFile(new URL(restored.mediaDirectory + page), 'utf8'), 'invoice fixture');
  assert.equal(await readFile(new URL(activeDatabase), 'utf8'), 'active ledger');

  const failedId = '2C7BD9AE-1A64-4E72-8519-9D34EDA8EDD8';
  await assert.rejects(stageRestoreGeneration(uri('complete'), uri('Documents'), failedId, manifest, {
    ...restoreFiles,
    async copy(source, destination) {
      if (destination.includes('product-photos')) throw new Error('No space left on device');
      await files.copy(source, destination);
    },
  }), /No space left on device/u);
  assert.deepEqual(await readdir(join(temporary, 'Documents', 'dukaanflow-workspaces')), [generationId]);
  assert.equal(await readFile(new URL(activeDatabase), 'utf8'), 'active ledger');

  const invalid = { ...manifest, media: [...manifest.media, { ...manifest.media[0], path: 'media/../manifest.json' }] };
  await assert.rejects(validateStagedBackup(uri('complete'), JSON.stringify(invalid), async () => {
    assert.fail('all paths must be validated before opening any backup files');
  }), /Invalid attachment path/u);
  const duplicate = { ...manifest, media: [...manifest.media, { ...manifest.media[0], path: manifest.media[0].path.toUpperCase().replace('MEDIA/', 'media/') }] };
  await assert.rejects(validateStagedBackup(uri('complete'), JSON.stringify(duplicate), files.fingerprint), /Duplicate path/u);
  await files.writeText(uri('complete/media/' + photo), 'fraud fixture');
  await assert.rejects(validateStagedBackup(uri('complete'), JSON.stringify(manifest), files.fingerprint), /recorded checksum/u);

  await rm(join(temporary, 'Documents', photo));
  await assert.rejects(stageBackupPackage(uri('incomplete'), uri('Documents'), snapshot, files));
  assert.deepEqual((await readdir(temporary)).sort(), ['Documents', 'complete']);
});
