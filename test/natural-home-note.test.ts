import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeHomeNote, toHomeNoteBatchInput } from '../src/home-capture.ts';

const directory = mkdtempSync(join(tmpdir(), 'dukaanflow-natural-note-'));
process.env.DUKAANFLOW_TEST_DB_PATH = join(directory, 'dukaanflow.db');
const store = await import('../src/store.ts');

test('a single spoken Hindi note saves linked stock and udhaar, retries, and undoes atomically', async (t) => {
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const raj = await store.createSupplier('live', { name: 'राज', aliases: [] });
  const raju = await store.createCustomer('live', 'natural-raju', { name: 'राजू', aliases: [] });
  const products = [
    { id: 'natural-atta', name: 'आटा', packSize: 'loose', unit: 'kg' },
    { id: 'natural-milk', name: 'दूध', packSize: 'bulk', unit: 'kg' },
    { id: 'natural-bread', name: 'Bread', packSize: 'loaf', unit: 'piece' },
    { id: 'natural-egg', name: 'अंडा', packSize: 'single', unit: 'piece' },
    { id: 'natural-butter', name: 'Butter', packSize: '100 g', unit: 'packet' },
  ] as const;
  for (const product of products) await store.saveCatalogItem('live', { ...product, aliases: [] });
  const note = 'राज मेरे supplier है माल का। आज उसने मेरे को 10 kg आटा और 5 kg दूध भेजा है। राजू ने मेरे से ₹100 उधार लिया है और उसके बदले 4 bread, 2 अंडा, 1 bread और 1 butter लिया है, रविवार तक चुका देगा।';
  const batch = toHomeNoteBatchInput(analyzeHomeNote(note,
    await store.listCustomers('live'), await store.listSuppliers('live'), '2026-11-26', await store.listCatalog('live')));
  assert.ok(batch?.sale && batch.credit && batch.receipt);
  const operationId = 'natural-hindi-note';
  const stock = async () => {
    const levels = await store.listStockLevels('live');
    return products.map(({ id }) => levels.find(({ catalogueItemId }) => id === catalogueItemId)?.quantity ?? 0);
  };
  await assert.rejects(store.recordHomeNoteBatch('live', operationId, batch), /Not enough Bread/u);
  assert.equal(await store.readReceipt('live', `${operationId}:supplier`), null);
  assert.equal(await store.readCustomerBalance('live', raju.id), 0);
  assert.deepEqual(await stock(), [0, 0, 0, 0, 0]);

  await store.adjustStock('live', 'natural-bread-opening', 'natural-bread', 7, 'Opening stock');
  await store.adjustStock('live', 'natural-egg-opening', 'natural-egg', 3, 'Opening stock');
  await store.adjustStock('live', 'natural-butter-opening', 'natural-butter', 2, 'Opening stock');
  await assert.rejects(store.recordHomeNoteBatch('live', operationId, {
    ...batch, sale: { ...batch.sale, lines: [{ catalogueItemId: 'natural-bread', quantity: 4 }, { catalogueItemId: 'natural-bread', quantity: 4 }] },
  }), /Combine quantities/u);
  assert.deepEqual(await stock(), [0, 0, 7, 3, 2]);
  await store.recordHomeNoteBatch('live', operationId, batch);
  await store.recordHomeNoteBatch('live', operationId, batch);
  assert.deepEqual(await stock(), [10, 5, 2, 1, 1]);
  assert.equal(await store.readCustomerBalance('live', raju.id), 10_000);
  const promises = await store.listCustomerPromises('live', raju.id);
  assert.equal(promises.length, 1);
  assert.equal(promises[0].dueDate, '2026-11-29');
  assert.equal(promises[0].amountPaise, 10_000);
  const receipt = await store.readReceipt('live', `${operationId}:supplier`);
  assert.equal(receipt?.supplier, raj.name);
  assert.equal(receipt?.receiptTotalPaise, null);
  assert.equal((await store.listSuppliers('live')).find(({ id }) => id === raj.id)?.balancePaise, 0);
  const sales = await store.listRetailSales('live', raju.id);
  assert.equal(sales.length, 1);
  assert.equal(sales[0].paymentState, 'credit');
  assert.equal(sales[0].amountPaise, 10_000);
  assert.deepEqual(sales[0].lines.map(({ quantity }) => quantity), [5, 2, 1]);

  await store.reverseCustomerCreditEvent('live', `${operationId}:credit`, 'natural-customer-correction');
  assert.equal(await store.readCustomerBalance('live', raju.id), 0);
  assert.equal((await store.listCustomerPromises('live', raju.id))[0]?.status, 'cancelled');
  assert.equal((await store.listRetailSales('live', raju.id)).length, 0);
  assert.deepEqual(await stock(), [10, 5, 7, 3, 2]);
  await store.reverseHomeNoteBatch('live', operationId);
  assert.deepEqual(await stock(), [0, 0, 7, 3, 2]);
  assert.equal(await store.readCustomerBalance('live', raju.id), 0);

  const undatedNote = note.replace(', रविवार तक चुका देगा', '');
  const estimatedBatch = toHomeNoteBatchInput(analyzeHomeNote(undatedNote,
    await store.listCustomers('live'), await store.listSuppliers('live'), '2026-11-26', await store.listCatalog('live')));
  assert.ok(estimatedBatch);
  await store.recordHomeNoteBatch('live', 'estimated-follow-up-note', estimatedBatch);
  const estimated = (await store.listCustomerPromises('live', raju.id)).find((item) => item.relatedEventId === 'estimated-follow-up-note:credit');
  assert.equal(estimated?.dateSource, 'estimated');
  assert.equal(estimated?.dueDate, '2026-12-03');
  await store.reverseHomeNoteBatch('live', 'estimated-follow-up-note');

  const wrongCustomer = await store.createCustomer('live', 'natural-rajesh', { name: 'राजेश', aliases: ['राजू'] });
  const ambiguous = analyzeHomeNote(note,
    await store.listCustomers('live'), await store.listSuppliers('live'), '2026-11-26', await store.listCatalog('live'));
  assert.equal(toHomeNoteBatchInput(ambiguous), null);
  assert.deepEqual(ambiguous.clarification, { kind: 'customer', label: 'राजू', ambiguous: true });
  assert.equal(await store.readCustomerBalance('live', wrongCustomer.id), 0);
});

test('Hindi spoken product names resolve to English barcode catalogue names across supplier and customer events', async () => {
  const suppliers = [{ id: 'milk-supplier', name: 'Sharma', aliases: [] }] as unknown as Awaited<ReturnType<typeof store.listSuppliers>>;
  const customers = [{ id: 'milk-customer', name: 'Tinku', aliases: [] }] as unknown as Awaited<ReturnType<typeof store.listCustomers>>;
  const catalog = [
    { id: 'barcode-milk-500', name: 'Milk', packSize: '500 ml', unit: 'packet' as const, aliases: [] },
    { id: 'barcode-bread', name: 'Bread', packSize: 'loaf', unit: 'piece' as const, aliases: [] },
    { id: 'barcode-butter', name: 'Butter', packSize: '100 g', unit: 'packet' as const, aliases: [] },
  ];
  const note = 'Sharma मेरे supplier है माल का। आज उसने मेरे को पांच पैकेट दूध भेजे। Tinku ने मुझसे दो packet दूध खरीदे।';
  const analysis = analyzeHomeNote(note, customers, suppliers, '2026-11-27', catalog);
  const batch = toHomeNoteBatchInput(analysis);

  assert.deepEqual(analysis.unresolvedSegments, []);
  assert.equal(batch?.receipt?.supplier, 'Sharma');
  assert.deepEqual(batch?.receipt?.lines.map(({ catalogItemId, quantity, unit }) => ({ catalogItemId, quantity, unit })), [
    { catalogItemId: 'barcode-milk-500', quantity: 5, unit: 'packet' },
  ]);
  assert.deepEqual(batch?.sale?.lines, [{ catalogueItemId: 'barcode-milk-500', quantity: 2 }]);
  assert.equal(batch?.sale?.customerId, 'milk-customer');
});
