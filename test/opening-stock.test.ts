import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeHomeNote, toHomeNoteBatchInput } from '../src/home-capture.ts';

const directory = mkdtempSync(join(tmpdir(), 'dukaanflow-opening-stock-'));
process.env.DUKAANFLOW_TEST_DB_PATH = join(directory, 'dukaanflow.db');
const store = await import('../src/store.ts');

test('opening stock is shop-scoped and later deliveries and walk-in purchases use it', async (t) => {
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const shop = await store.createShopProfile('Counter workflow test');
  await store.writeOpeningStockPending(true);
  const pack = { id: 'opening-bread', name: 'Bread', packSize: 'Loaf', unit: 'piece' as const, aliases: ['ब्रेड'], barcode: '8901234567890' };
  await assert.rejects(store.saveCatalogItem('live', pack, 0), /valid opening stock/u);
  assert.equal((await store.listCatalog('live')).length, 0);
  await store.saveCatalogItem('live', pack, 6);
  await store.saveCatalogItem('live', pack, 6);
  await assert.rejects(store.saveCatalogItem('live', pack, 7), /already saved/u);
  await assert.rejects(store.saveCatalogItem('live', { ...pack, id: 'barcode-duplicate', name: 'Another item' }, 6), /already linked/u);
  await assert.rejects(store.saveCatalogItem('live', { ...pack, barcode: '08901234567890', id: 'barcode-padded', name: 'Padded duplicate' }, 6), /already linked/u);
  assert.deepEqual((await store.listOpeningStockItems('live')).map(({ id, quantity }) => [id, quantity]), [[pack.id, 6]]);
  const stock = async () => (await store.listStockLevels('live')).find(({ catalogueItemId }) => catalogueItemId === pack.id)?.quantity;
  assert.equal(await stock(), 6);
  assert.equal(await store.readOpeningStockPending(), true);
  await store.writeOpeningStockPending(false);
  await store.createShopProfile('Second counter');
  assert.equal(await store.readOpeningStockPending(), false);
  assert.deepEqual(await store.listOpeningStockItems('live'), []);
  await store.selectShopProfile(shop.id);
  assert.equal(await store.readOpeningStockPending(), false);

  const suppliers = await store.listSuppliers('live');
  const catalog = await store.listCatalog('live');
  const delivery = toHomeNoteBatchInput(analyzeHomeNote('नए सप्लायर मोहन ने 4 pieces bread भेजे।', [], suppliers, '2026-11-26', catalog));
  assert.ok(delivery?.receipt);
  await store.recordHomeNoteBatch('live', 'counter-first-delivery', delivery);
  assert.equal(await stock(), 10);
  assert.equal((await store.listSuppliers('live')).find(({ name }) => name === 'मोहन')?.deliveryCount, 1);

  const purchase = toHomeNoteBatchInput(analyzeHomeNote('एक ग्राहक ने 2 ब्रेड खरीदे।', [], suppliers, '2026-11-26', catalog));
  assert.ok(purchase?.sale);
  assert.equal(purchase.sale.customerId, null);
  await store.recordHomeNoteBatch('live', 'counter-first-sale', purchase);
  assert.equal(await stock(), 8);
  assert.deepEqual(await store.listCustomers('live'), []);
  assert.equal(toHomeNoteBatchInput(analyzeHomeNote('एक ग्राहक ने ₹100 उधार पर 2 ब्रेड खरीदे।', [], suppliers, '2026-11-26', catalog)), null);
});
