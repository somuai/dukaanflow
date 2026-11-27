import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeHomeNote, toHomeNoteBatchInput } from '../src/home-capture.ts';

const directory = mkdtempSync(join(tmpdir(), 'dukaanflow-voice-commerce-'));
process.env.DUKAANFLOW_TEST_DB_PATH = join(directory, 'dukaanflow.db');
const store = await import('../src/store.ts');

test('a natural Hindi credit note captures known customer, cash amount, and named product counts', () => {
  const customers = [{ id: 'raju', name: 'Raju', aliases: [] }] as never[];
  const catalog = [
    { id: 'bread-loaf', name: 'Bread', packSize: 'loaf', unit: 'piece' as const, aliases: [] },
    { id: 'eggs-single', name: 'Egg', packSize: 'single', unit: 'piece' as const, aliases: ['अंडा', 'अंडे'] },
    { id: 'milk-packet', name: 'Milk', packSize: '500 ml packet', unit: 'packet' as const, aliases: ['दूध'] },
  ];
  const note = 'Raju ने आज मेरे से ₹100 ले लिया है और उसके बदले 4 bread, 2 अंडे और 1 पैकेट दूध लिया है।';
  const analysis = analyzeHomeNote(note, customers, [], '2026-11-27', catalog);
  const batch = toHomeNoteBatchInput(analysis);

  assert.deepEqual(analysis.unresolvedSegments, []);
  assert.equal(batch?.credit?.event.customerId, 'raju');
  assert.equal(batch?.credit?.event.amountPaise, 10_000);
  assert.deepEqual(batch?.sale?.lines, [
    { catalogueItemId: 'bread-loaf', quantity: 4 },
    { catalogueItemId: 'eggs-single', quantity: 2 },
    { catalogueItemId: 'milk-packet', quantity: 1 },
  ]);
  assert.equal(batch?.credit?.promise?.dateSource, 'estimated');
  assert.equal(batch?.credit?.promise?.dueDate, '2026-12-04');
});

test('an unspoken milk quantity does not silently reduce stock by one packet', () => {
  const customers = [{ id: 'raju', name: 'Raju', aliases: [] }] as never[];
  const catalog = [
    { id: 'bread-loaf', name: 'Bread', packSize: 'loaf', unit: 'piece' as const, aliases: [] },
    { id: 'eggs-single', name: 'Egg', packSize: 'single', unit: 'piece' as const, aliases: ['अंडे'] },
    { id: 'milk-packet', name: 'Milk', packSize: '500 ml packet', unit: 'packet' as const, aliases: ['दूध'] },
  ];
  const result = analyzeHomeNote('Raju ने आज मेरे से ₹100 ले लिया है और उसके बदले 4 bread, 2 अंडे और दूध लिया है।', customers, [], '2026-11-27', catalog);
  assert.equal(toHomeNoteBatchInput(result), null);
  assert.ok(result.unresolvedSegments.length > 0);
  assert.equal(result.clarification?.kind, 'quantity');
  const newCustomerResult = analyzeHomeNote('Raju ने आज मेरे से ₹100 ले लिया है और उसके बदले 4 bread, 2 अंडे और दूध लिया है।', [], [], '2026-11-27', catalog);
  assert.equal(toHomeNoteBatchInput(newCustomerResult), null, 'An unknown customer must not turn an incomplete itemized sale into a lump-sum credit');
});

test('Hindi egg names match English barcode products but never choose between variants', () => {
  const customer = [{ id: 'raju', name: 'Raju', aliases: [] }] as never[];
  const egg = { id: 'egg-single', name: 'Egg', packSize: 'single', unit: 'piece' as const, aliases: [] };
  const note = 'Raju ने मुझसे 2 अंडे खरीदे।';
  const single = toHomeNoteBatchInput(analyzeHomeNote(note, customer, [], '2026-11-27', [egg]));
  assert.deepEqual(single?.sale?.lines, [{ catalogueItemId: 'egg-single', quantity: 2 }]);

  const ambiguous = analyzeHomeNote(note, customer, [], '2026-11-27', [egg, { ...egg, id: 'egg-large', packSize: 'large' }]);
  assert.equal(toHomeNoteBatchInput(ambiguous), null);
  assert.equal(ambiguous.clarification?.ambiguous, true);
});

test('a shared supplier carton quantity applies to each explicitly listed product', () => {
  const suppliers = [{ id: 'mannu', name: 'मन्नू', aliases: [] }] as never[];
  const catalog = [
    { id: 'atta-carton', name: 'Wheat Flour', packSize: 'carton · 10 kg', unit: 'box' as const, aliases: ['आटा', 'carton'] },
    { id: 'milk-carton', name: 'Milk', packSize: 'carton · 4 x 500 ml', unit: 'box' as const, aliases: ['दूध', 'carton'], packageContent: '4 x 500 ml' },
    { id: 'milk-packet', name: 'Milk', packSize: '500 ml', unit: 'packet' as const, aliases: ['दूध'] },
  ];
  const note = 'मन्नू supplier ने मेरे को 4 carton आटा और दूध भेजा है।';
  const analysis = analyzeHomeNote(note, [], suppliers, '2026-11-27', catalog);
  const batch = toHomeNoteBatchInput(analysis);

  assert.deepEqual(analysis.unresolvedSegments, []);
  assert.deepEqual(batch?.receipt?.lines.map(({ catalogItemId, quantity, unit }) => ({ catalogItemId, quantity, unit })), [
    { catalogItemId: 'atta-carton', quantity: 4, unit: 'box' },
    { catalogItemId: 'milk-packet', quantity: 16, unit: 'packet' },
  ]);
});

test('mixed-language home capture persists stock, customer credit, and product lines in one shop ledger', async (t) => {
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const supplierShop = await store.createShopProfile('Voice supplier isolation test');
  const supplier = await store.createSupplier('live', { name: 'Mannu', aliases: ['मन्नू'] });
  const supplierCatalog = [
    { id: 'voice-flour-carton', name: 'Wheat Flour', packSize: 'carton · 10 kg', unit: 'box' as const, aliases: ['आटा', 'carton'] },
    { id: 'voice-milk-carton', name: 'Milk', packSize: 'carton · 4 x 500 ml', unit: 'box' as const, aliases: ['दूध', 'carton'], packageContent: '4 x 500 ml' },
    { id: 'voice-milk-packet-delivery', name: 'Milk', packSize: '500 ml', unit: 'packet' as const, aliases: ['दूध'] },
  ];
  for (const item of supplierCatalog) await store.saveCatalogItem('live', item);

  const delivery = toHomeNoteBatchInput(analyzeHomeNote(
    'मन्नू supplier ने मेरे को 4 carton आटा और दूध भेजा है।', [], await store.listSuppliers('live'),
    '2026-11-27', await store.listCatalog('live'),
  ));
  assert.ok(delivery?.receipt);
  await store.recordHomeNoteBatch('live', 'voice-shared-carton-delivery', delivery);
  await store.recordHomeNoteBatch('live', 'voice-shared-carton-delivery', delivery);
  assert.deepEqual((await store.readReceipt('live', 'voice-shared-carton-delivery:supplier'))?.lines
    .map(({ catalogItemId, quantity }) => [catalogItemId, quantity]), [
    ['voice-flour-carton', 4], ['voice-milk-packet-delivery', 16],
  ]);
  assert.equal((await store.listSuppliers('live')).find(({ id }) => id === supplier.id)?.deliveryCount, 1);
  assert.equal((await store.listStockLevels('live')).find(({ catalogueItemId }) => catalogueItemId === 'voice-flour-carton')?.quantity, 4);
  assert.equal((await store.listStockLevels('live')).find(({ catalogueItemId }) => catalogueItemId === 'voice-milk-packet-delivery')?.quantity, 16);

  const customerShop = await store.createShopProfile('Voice customer isolation test');
  const customerCatalog = [
    { id: 'voice-bread', name: 'Bread', packSize: 'loaf', unit: 'piece' as const, aliases: [] },
    { id: 'voice-eggs', name: 'Egg', packSize: 'single', unit: 'piece' as const, aliases: ['अंडा', 'अंडे'] },
    { id: 'voice-milk-packet', name: 'Milk', packSize: '500 ml', unit: 'packet' as const, aliases: ['दूध'] },
  ];
  for (const item of customerCatalog) await store.saveCatalogItem('live', item);
  await store.adjustStock('live', 'voice-opening-bread', 'voice-bread', 10, 'Opening stock');
  await store.adjustStock('live', 'voice-opening-eggs', 'voice-eggs', 10, 'Opening stock');
  await store.adjustStock('live', 'voice-opening-milk', 'voice-milk-packet', 10, 'Opening stock');
  const purchase = analyzeHomeNote(
    'Raju VoiceQA ने आज मेरे से ₹100 ले लिया है और उसके बदले 4 bread, 2 अंडे और 1 पैकेट दूध लिया है।',
    await store.listCustomers('live'), await store.listSuppliers('live'), '2026-11-27', await store.listCatalog('live'),
  );
  const newCustomerId = 'voice-created-raju';
  const customerBatch = toHomeNoteBatchInput(purchase, newCustomerId);
  assert.ok(customerBatch?.credit && customerBatch.sale && customerBatch.newCustomer, JSON.stringify({ purchase, customerBatch }));
  await store.recordHomeNoteBatch('live', 'voice-rupee-goods-credit', customerBatch);
  await store.recordHomeNoteBatch('live', 'voice-rupee-goods-credit', customerBatch);
  assert.equal(await store.readCustomerBalance('live', newCustomerId), 10_000);
  assert.equal((await store.listCustomerPromises('live', newCustomerId))[0]?.dueDate, '2026-12-04');
  assert.deepEqual((await store.listRetailSales('live', newCustomerId))[0]?.lines
    .map(({ catalogueItemId, quantity }) => [catalogueItemId, quantity]), [
    ['voice-bread', 4], ['voice-eggs', 2], ['voice-milk-packet', 1],
  ]);
  assert.deepEqual((await store.listStockLevels('live')).filter(({ catalogueItemId }) =>
    ['voice-bread', 'voice-eggs', 'voice-milk-packet'].includes(catalogueItemId))
    .map(({ catalogueItemId, quantity }) => [catalogueItemId, quantity]), [
    ['voice-bread', 6], ['voice-eggs', 8], ['voice-milk-packet', 9],
  ]);
  assert.equal((await store.listCustomers('live')).filter(({ id }) => id === newCustomerId).length, 1);
  const customerShopId = customerShop.id;
  await store.selectShopProfile(supplierShop.id);
  assert.equal((await store.listCustomers('live')).some(({ id }) => id === newCustomerId), false);
  await store.selectShopProfile(customerShopId);
  assert.equal((await store.listCustomers('live')).some(({ id }) => id === newCustomerId), true);
});
