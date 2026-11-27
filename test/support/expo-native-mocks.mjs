import { backup, DatabaseSync } from 'node:sqlite';
import { randomUUID as nativeRandomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

class ExpoSQLiteTestDatabase {
  constructor(filename) {
    this.filename = filename;
    this.database = new DatabaseSync(filename, { enableForeignKeyConstraints: true });
  }

  async execAsync(sql) {
    this.database.exec(sql);
  }

  async runAsync(sql, ...params) {
    return this.database.prepare(sql).run(...params);
  }

  async getFirstAsync(sql, ...params) {
    return this.database.prepare(sql).get(...params) ?? null;
  }

  async getAllAsync(sql, ...params) {
    return this.database.prepare(sql).all(...params);
  }

  async isInTransactionAsync() {
    return this.database.isTransaction;
  }

  async closeAsync() {
    this.database.close();
  }
}

export async function openDatabaseAsync(name, _options, directory) {
  if (name === ':memory:') return new ExpoSQLiteTestDatabase(name);
  if (directory) return new ExpoSQLiteTestDatabase(join(directory, name));
  const filename = process.env.DUKAANFLOW_TEST_DB_PATH;
  if (!filename) throw new Error('DUKAANFLOW_TEST_DB_PATH must be set by the integration test.');
  const routedFilename = name === 'dukaanflow.db'
    ? filename
    : filename.replace(/\.db$/u, `-${name.replace(/[^a-zA-Z0-9_-]/gu, '')}.db`);
  return new ExpoSQLiteTestDatabase(routedFilename);
}

export async function backupDatabaseAsync({ sourceDatabase, destDatabase }) {
  await backup(sourceDatabase.database, destDatabase.filename);
}

export async function deleteDatabaseAsync(name, directory) {
  rmSync(join(directory, name), { force: true });
}

export function randomUUID() {
  return nativeRandomUUID();
}
