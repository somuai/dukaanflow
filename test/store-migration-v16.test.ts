import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const directory = mkdtempSync(join(tmpdir(), 'dukaanflow-v16-migration-'));
const databasePath = join(directory, 'dukaanflow.db');
process.env.DUKAANFLOW_TEST_DB_PATH = databasePath;
const database = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });
database.exec(`
  CREATE TABLE ledger_entry (
    mode TEXT NOT NULL,
    id TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at TEXT NOT NULL,
    business_date TEXT NOT NULL,
    supplier TEXT,
    receipt_total_paise INTEGER,
    amount_paid_paise INTEGER,
    payment_method TEXT,
    reverses_id TEXT,
    PRIMARY KEY (mode, id)
  );
  INSERT INTO ledger_entry (mode, id, kind, created_at, business_date, supplier, receipt_total_paise, amount_paid_paise, payment_method)
  VALUES ('live', 'v16-receipt', 'receipt', '2026-11-24T10:00:00.000Z', '2026-11-24', 'Sharma Supply', 12500, 5000, 'cash');
  PRAGMA user_version = 16;
`);

const store = await import('../src/store.ts');

test('version 16 migration adds nullable voice_note without changing existing receipt history', async (t) => {
  t.after(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  // Opening a v16 store runs the migration before this intentionally incomplete
  // fixture fails the later catalogue query.
  await assert.rejects(store.listCatalog('live'), /no such table: catalogue_item/u);

  assert.equal(database.prepare('PRAGMA user_version').get().user_version, 17);
  assert.ok((database.prepare('PRAGMA table_info(ledger_entry)').all() as { name: string }[])
    .some(({ name }) => name === 'voice_note'));
  assert.deepEqual({ ...database.prepare(
    'SELECT mode, id, supplier, receipt_total_paise, amount_paid_paise, voice_note FROM ledger_entry WHERE id = ?',
  ).get('v16-receipt') }, {
    mode: 'live', id: 'v16-receipt', supplier: 'Sharma Supply',
    receipt_total_paise: 12500, amount_paid_paise: 5000, voice_note: null,
  });
  assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
});
