import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeHomeNote } from '../src/home-capture.ts';

const directory = mkdtempSync(join(tmpdir(), 'dukaanflow-store-'));
const databasePath = join(directory, 'dukaanflow.db');
process.env.DUKAANFLOW_TEST_DB_PATH = databasePath;

const store = await import('../src/store.ts');
const database = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });

const input = {
  voiceNote: 'One Maggi packet was torn; the owner confirmed one damaged and one missing.',
  supplier: 'Sharma Kirana Supply',
  invoiceNumber: 'DF-2401',
  invoiceDate: '2026-11-23',
  dueDate: '2026-11-30',
  invoiceEvidenceUris: ['file:///private/fixture/invoice.jpg'],
  invoiceTotalPaise: 84_000,
  amountPaidPaise: 50_000,
  paymentMethod: 'cash' as const,
  lines: [
    {
      lineId: 'maggi-line', catalogItemId: 'maggi-70g', name: 'Maggi Masala Noodles',
      packSize: '70 g', unit: 'packet' as const, billedQuantity: 12, goodQuantity: 10,
      damagedQuantity: 1, missingQuantity: 1, extraQuantity: 0, acceptedExtraQuantity: 0,
      lots: [
        { quantity: 3, batchCode: 'MAG-A', expiryDate: '2026-11-26' },
        { quantity: 2, batchCode: 'MAG-B', expiryDate: '2026-11-23' },
        { quantity: 1, batchCode: null, expiryDate: null },
      ],
    },
    {
      lineId: 'surf-line', catalogItemId: 'surf-excel-500g', name: 'Surf Excel',
      packSize: '500 g', unit: 'packet' as const, billedQuantity: 6, goodQuantity: 6,
      damagedQuantity: 0, missingQuantity: 0, extraQuantity: 0, acceptedExtraQuantity: 0,
    },
  ],
};

function rows(sql: string, ...params: (string | number | null)[]) {
  return database.prepare(sql).all(...params) as Record<string, unknown>[];
}

test('delivery confirmation uses real SQLite transactions, persists, and reverses cleanly', async (t) => {
  t.after(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const catalog = await store.listCatalog('demo');
  assert.equal(catalog.length, 6);
  assert.equal(database.prepare('PRAGMA user_version').get().user_version, 17);

  await store.setReorderPoint('demo', 'maggi-70g', 12, 'packet');
  await store.setReorderPoint('demo', 'maggi-70g', 12, 'packet');
  const planning = await store.listRestockPlanning('demo');
  assert.deepEqual(planning.find(({ catalogueItemId }) => catalogueItemId === 'maggi-70g'), {
    catalogueItemId: 'maggi-70g', name: 'Maggi Masala Noodles', packSize: '70 g', unit: 'packet',
    onHandQuantity: 0, minimumQuantity: 12, suggestedQuantity: 12,
  }, 'restock suggestions use the owner threshold and current on-hand only');
  await store.saveRestockDraftLine('demo', 'maggi-70g', 12, 'packet');
  await store.saveRestockDraftLine('demo', 'maggi-70g', 12, 'packet');
  const restockLines = await store.listRestockDraft('demo');
  assert.equal(restockLines.length, 1, 'the owner can persist one explicit-unit draft quantity');
  assert.equal(restockLines[0].id, 'maggi-70g');
  assert.equal(restockLines[0].name, 'Maggi Masala Noodles');
  assert.equal(restockLines[0].packSize, '70 g');
  assert.equal(restockLines[0].unit, 'packet');
  assert.equal(restockLines[0].quantity, 12, 'retrying the same absolute draft quantity is safe');
  assert.equal((await store.listStockLevels('demo')).find(({ catalogueItemId }) => catalogueItemId === 'maggi-70g')?.quantity, 0,
    'planning a restock never changes stock');
  assert.equal(await store.readSupplierBalance('demo', input.supplier), 0, 'planning a restock never creates a payable');
  assert.deepEqual((await store.listRestockDraft('live')).map((line) => ({ ...line })), [], 'restock drafts stay isolated by ledger mode');
  assert.deepEqual((await store.listRestockPlanning('live')).map((item) => ({ ...item })), [], 'reorder points stay isolated by ledger mode');
  await assert.rejects(store.setReorderPoint('demo', 'maggi-70g', -1, 'packet'), /non-negative whole number/u);
  await assert.rejects(store.saveRestockDraftLine('demo', 'maggi-70g', 2, 'kg'), /catalogue unit/u);
  await store.removeRestockDraftLine('demo', 'maggi-70g');
  assert.deepEqual((await store.listRestockDraft('demo')).map((line) => ({ ...line })), []);

  const supplier = await store.createSupplier('demo', { name: input.supplier, aliases: ['Sharma ji', 'S. K. Supply'] });
  const purchaseOrder = await store.recordSupplierOrder('demo', 'purchase-order-1', {
    supplierId: supplier.id,
    expectedDate: '2026-11-26',
    note: 'Weekly replenishment',
    lines: [
      { catalogueItemId: 'maggi-70g', quantity: 12, quotedUnitPricePaise: 1_000 },
      { catalogueItemId: 'surf-excel-500g', quantity: 6, quotedUnitPricePaise: 3_000 },
    ],
  });
  assert.equal(purchaseOrder.status, 'draft', 'saving an order note does not imply it was placed with the supplier');
  assert.equal(purchaseOrder.lines[0].outstandingQuantity, 12);
  assert.equal(purchaseOrder.quotedTotalPaise, 30_000, 'quoted order value is kept separate from invoice payable');
  assert.equal(await store.readSupplierBalance('demo', input.supplier), 0, 'saving an order draft does not create supplier payable');
  assert.equal((await store.recordSupplierOrder('demo', 'purchase-order-1', {
    supplierId: supplier.id, expectedDate: '2026-11-26', note: 'Weekly replenishment',
    lines: [
      { catalogueItemId: 'maggi-70g', quantity: 12, quotedUnitPricePaise: 1_000 },
      { catalogueItemId: 'surf-excel-500g', quantity: 6, quotedUnitPricePaise: 3_000 },
    ],
  })).id, purchaseOrder.id, 'order retries are idempotent');
  assert.deepEqual(await store.listSupplierOrders('live', supplier.id), [], 'orders are isolated by shop ledger');

  const saved = await store.confirmDeliveryReconciliation('demo', 'integration-delivery-1', input);
  const tinku = await store.createCustomer('demo', 'customer-tinku-ui-qa', { name: 'Tinku UI QA', aliases: ['Tinku'] });
  const saleInput = {
    customerId: tinku.id, customerLabel: 'Tinku ji', paymentState: 'unknown' as const, amountPaise: null,
    sourceText: 'Tinku ji ne aaj mere se 2 packets maggi kharide',
    lines: [{ catalogueItemId: 'maggi-70g', quantity: 2 }],
  };
  const sale = await store.recordRetailSale('demo', 'integration-sale-1', saleInput);
  assert.equal(sale.paymentState, 'unknown', 'an unspecified payment is not assumed to be cash or credit');
  assert.equal((await store.listCustomers('demo')).find(({ id }) => id === tinku.id)?.balancePaise, 0,
    'quantity-only purchase memory must not alter the confirmed credit balance');
  assert.equal((await store.listStockLevels('demo')).find(({ catalogueItemId }) => catalogueItemId === 'maggi-70g')?.quantity, 8);
  assert.equal((await store.listRetailSales('demo'))[0]?.id, sale.id, 'sale history returns its customer and source record');
  assert.equal((await store.recordRetailSale('demo', 'integration-sale-1', saleInput)).id, sale.id, 'retry is idempotent');
  await store.reverseRetailSale('demo', sale.id, 'integration-sale-reversal-1');
  await store.reverseRetailSale('demo', sale.id, 'integration-sale-reversal-retry');
  assert.equal((await store.listRetailSales('demo')).length, 0, 'reversal hides the sale from active history but preserves it in the database');
  assert.equal((await store.listStockLevels('demo')).find(({ catalogueItemId }) => catalogueItemId === 'maggi-70g')?.quantity, 10,
    'linked reversal restores the two sold packets');

  const voiceSupplier = await store.createSupplier('live', { name: 'Sharma Distributors', aliases: ['Sharma ji'] });
  const voiceCustomer = await store.createCustomer('live', 'voice-tinku', { name: 'Tinku ji', aliases: ['Tinku'] });
  await store.saveCatalogItem('live', { id: 'voice-maggi-kg', name: 'Maggi', packSize: '1 kg', unit: 'kg', aliases: ['maggi'] });
  await store.saveCatalogItem('live', { id: 'voice-maggi-packet', name: 'Maggi', packSize: '70 g', unit: 'packet', aliases: ['maggi'] });
  await store.saveCatalogItem('live', { id: 'voice-milk-500ml', name: 'Milk', packSize: '500 ml', unit: 'packet', aliases: ['दूध', 'doodh', 'milk'] });
  await store.saveCatalogItem('live', { id: 'voice-milk-carton', name: 'Milk', packSize: 'carton · 12 x 500 ml', unit: 'box', aliases: ['दूध', 'doodh', 'milk'], packageContent: '12 x 500 ml' });
  await store.adjustStock('live', 'voice-packet-opening-stock', 'voice-maggi-packet', 10, 'Opening quantity for mixed-note pipeline fixture');
  const homeNoteTranscript = 'Sharma जी ने आज 10 kg maggi भेजे हैं और 4 cartons दूध और Tinku जी ने आज मेरे से 2 packets maggi खरीदे हैं और 2 packets दूध';
  const homeNoteAnalysis = analyzeHomeNote(
    homeNoteTranscript,
    await store.listCustomers('live'),
    await store.listSuppliers('live'),
    '2026-11-26',
    await store.listCatalog('live'),
  );
  assert.deepEqual(homeNoteAnalysis.unresolvedSegments, [], 'the exact mixed Hinglish note resolves against the shop profiles and catalog');
  const supplierEvent = homeNoteAnalysis.events.find((event) => event.kind === 'supplier');
  const customerEvent = homeNoteAnalysis.events.find((event) => event.kind === 'customer');
  assert.ok(supplierEvent?.kind === 'supplier' && supplierEvent.supplierName && supplierEvent.lines);
  assert.ok(customerEvent?.kind === 'customer' && customerEvent.customerId && customerEvent.customerName && customerEvent.lines);
  assert.deepEqual(
    supplierEvent.lines.map(({ catalogueItemId, quantity }) => ({ catalogueItemId, quantity })),
    [
      { catalogueItemId: 'voice-maggi-kg', quantity: 10 },
      { catalogueItemId: 'voice-milk-500ml', quantity: 48 },
    ],
    'the delivery note maps Maggi and four cartons of milk into the shop-configured stock SKUs',
  );
  assert.deepEqual(
    customerEvent.lines.map(({ catalogueItemId, quantity }) => ({ catalogueItemId, quantity })),
    [
      { catalogueItemId: 'voice-maggi-packet', quantity: 2 },
      { catalogueItemId: 'voice-milk-500ml', quantity: 2 },
    ],
    'the customer clause preserves both product quantities as a separate sale event',
  );
  const homeNoteReceipt = {
    supplier: supplierEvent.supplierName, voiceNote: supplierEvent.sourceText,
    receiptTotalPaise: null, amountPaidPaise: null, paymentMethod: null,
    lines: supplierEvent.lines.map(({ catalogueItemId, name, packSize, quantity, unit }) => ({ catalogItemId: catalogueItemId, name, packSize, quantity, unit })),
  };
  const homeNoteSale = {
    customerId: voiceCustomer.id, customerLabel: customerEvent.customerName,
    paymentState: 'unknown' as const, amountPaise: null,
    sourceText: customerEvent.sourceText, lines: customerEvent.lines,
  };
  await store.recordHomeNoteBatch('live', 'hinglish-voice-pipeline-1', { receipt: homeNoteReceipt, sale: homeNoteSale });
  const voiceReceipt = await store.readReceipt('live', 'hinglish-voice-pipeline-1:supplier');
  assert.deepEqual(
    voiceReceipt?.lines.map(({ catalogItemId, quantity }) => ({ catalogueItemId: catalogItemId, quantity })),
    [
      { catalogueItemId: 'voice-maggi-kg', quantity: 10 },
      { catalogueItemId: 'voice-milk-500ml', quantity: 48 },
    ],
    'the saved supplier record contains every resolved delivery line at its converted quantity',
  );
  assert.equal(voiceReceipt?.voiceNote, homeNoteTranscript.slice(0, homeNoteTranscript.indexOf(' और Tinku')),
    'the supplier clause remains attached to its normalized stock receipt as audit evidence');
  assert.deepEqual(
    (await store.listRetailSales('live')).find(({ id }) => id === 'hinglish-voice-pipeline-1:customer')?.lines
      .map(({ catalogueItemId, quantity }) => ({ catalogueItemId, quantity })),
    [
      { catalogueItemId: 'voice-maggi-packet', quantity: 2 },
      { catalogueItemId: 'voice-milk-500ml', quantity: 2 },
    ],
    'the saved customer record contains both products and quantities independently of the supplier receipt',
  );
  assert.equal(
    (await store.listRetailSales('live')).find(({ id }) => id === 'hinglish-voice-pipeline-1:customer')?.sourceText,
    customerEvent.sourceText,
    'the customer sale keeps its own original clause as audit evidence',
  );
  assert.equal((await store.listSuppliers('live')).find(({ id }) => id === voiceSupplier.id)?.deliveryCount, 1,
    'a voice-created stock receipt appears in the matching supplier account history');
  assert.equal((await store.listStockLevels('live')).find(({ catalogueItemId }) => catalogueItemId === 'voice-maggi-packet')?.quantity, 8,
    'one note adds supplier stock before consuming customer sale stock');
  assert.equal((await store.listStockLevels('live')).find(({ catalogueItemId }) => catalogueItemId === 'voice-milk-500ml')?.quantity, 46,
    'supplier carton contents are stored in the explicitly configured sale unit before the customer purchase');
  assert.equal((await store.listStockLevels('live')).find(({ catalogueItemId }) => catalogueItemId === 'voice-maggi-kg')?.quantity, 10,
    'the supplier kilogram event updates its distinct catalog SKU');
  await store.recordHomeNoteBatch('live', 'hinglish-voice-pipeline-1', { receipt: homeNoteReceipt, sale: homeNoteSale });
  assert.equal((await store.listStockLevels('live')).find(({ catalogueItemId }) => catalogueItemId === 'voice-maggi-packet')?.quantity, 8,
    'retrying the same batch does not apply either event twice');
  assert.equal((await store.listStockLevels('live')).find(({ catalogueItemId }) => catalogueItemId === 'voice-milk-500ml')?.quantity, 46);
  await assert.rejects(store.recordHomeNoteBatch('live', 'mixed-note-rollback-1', {
    receipt: { ...homeNoteReceipt, lines: [{ ...homeNoteReceipt.lines[0], quantity: 1 }] },
    sale: { ...homeNoteSale, lines: [{ catalogueItemId: 'voice-maggi-packet', quantity: 20 }] },
  }), /Not enough Maggi/u);
  assert.equal(await store.readReceipt('live', 'mixed-note-rollback-1:supplier'), null,
    'a failed customer stock check rolls back the preceding supplier receipt');
  assert.equal((await store.listRetailSales('live')).some(({ id }) => id === 'mixed-note-rollback-1:customer'), false);
  assert.equal((await store.listStockLevels('live')).find(({ catalogueItemId }) => catalogueItemId === 'voice-maggi-packet')?.quantity, 8,
    'a rejected mixed note leaves stock unchanged');
  await store.reverseHomeNoteBatch('live', 'hinglish-voice-pipeline-1');
  assert.ok((await store.readReceipt('live', 'hinglish-voice-pipeline-1:supplier'))?.reversedAt,
    'one Undo reverses the supplier stock receipt');
  assert.equal((await store.listRetailSales('live')).some(({ id }) => id === 'hinglish-voice-pipeline-1:customer'), false,
    'one Undo reverses the customer purchase too');
  assert.equal((await store.listStockLevels('live')).find(({ catalogueItemId }) => catalogueItemId === 'voice-maggi-packet')?.quantity, 10,
    'the two saved events remain independently reversible');
  assert.equal((await store.listStockLevels('live')).find(({ catalogueItemId }) => catalogueItemId === 'voice-milk-500ml')?.quantity, 0,
    'reversing the note restores the converted stock too');
  assert.equal((await store.listStockLevels('live')).find(({ catalogueItemId }) => catalogueItemId === 'voice-maggi-kg')?.quantity, 0,
    'one Undo reverses the independently recorded kilogram SKU too');
  const mixedCreditTranscript = 'Sharma जी ने 5 kg maggi भेजे हैं और Tinku जी ने ₹100 उधार लिया, 4 दिन में देगा।';
  const mixedCreditAnalysis = analyzeHomeNote(
    mixedCreditTranscript,
    await store.listCustomers('live'),
    await store.listSuppliers('live'),
    '2026-11-26',
    await store.listCatalog('live'),
  );
  assert.deepEqual(mixedCreditAnalysis.unresolvedSegments, []);
  const creditSupplierEvent = mixedCreditAnalysis.events.find((event) => event.kind === 'supplier');
  const creditCustomerEvent = mixedCreditAnalysis.events.find((event) => event.kind === 'customer');
  assert.ok(creditSupplierEvent?.kind === 'supplier' && creditSupplierEvent.supplierName && creditSupplierEvent.lines);
  assert.ok(creditCustomerEvent?.kind === 'customer' && creditCustomerEvent.credit);
  const creditBatchReceipt = {
    supplier: creditSupplierEvent.supplierName, voiceNote: creditSupplierEvent.sourceText,
    receiptTotalPaise: null, amountPaidPaise: null, paymentMethod: null,
    lines: creditSupplierEvent.lines.map(({ catalogueItemId, name, packSize, quantity, unit }) => ({ catalogItemId: catalogueItemId, name, packSize, quantity, unit })),
  };
  const homeCredit = creditCustomerEvent.credit;
  const creditBatch = {
    event: {
      customerId: homeCredit.customerId, kind: homeCredit.kind, amountPaise: homeCredit.amountPaise,
      paymentMethod: homeCredit.paymentMethod, note: null, sourceText: homeCredit.sourceText,
    },
    promise: homeCredit.promise ? { amountPaise: homeCredit.promise.amountPaise, dueDate: homeCredit.promise.dueDate, note: null } : undefined,
  };
  await store.recordHomeNoteBatch('live', 'hinglish-credit-note-1', { receipt: creditBatchReceipt, credit: creditBatch });
  assert.equal(await store.readCustomerBalance('live', voiceCustomer.id), 10_000,
    'a mixed Home note records customer credit separately from the supplier receipt');
  assert.equal((await store.listCustomerPromises('live', voiceCustomer.id))[0]?.dueDate, '2026-11-30');
  assert.equal((await store.readReceipt('live', 'hinglish-credit-note-1:supplier'))?.lines[0]?.quantity, 5);
  assert.equal((await store.listStockLevels('live')).find(({ catalogueItemId }) => catalogueItemId === 'voice-maggi-kg')?.quantity, 5);
  await store.recordHomeNoteBatch('live', 'hinglish-credit-note-1', { receipt: creditBatchReceipt, credit: creditBatch });
  assert.equal(await store.readCustomerBalance('live', voiceCustomer.id), 10_000, 'retrying a mixed credit note is idempotent');
  await assert.rejects(store.recordHomeNoteBatch('live', 'hinglish-credit-note-1', { receipt: creditBatchReceipt }), /different note contents/u,
    'reusing an operation ID while omitting its saved credit is rejected');
  assert.equal(await store.readCustomerBalance('live', voiceCustomer.id), 10_000);
  await assert.rejects(store.recordHomeNoteBatch('live', 'hinglish-two-customer-events-1', {
    receipt: creditBatchReceipt,
    sale: { customerId: voiceCustomer.id, customerLabel: 'Tinku ji', paymentState: 'unknown', amountPaise: null,
      sourceText: 'Tinku ji ne ek packet kharida', lines: [{ catalogueItemId: 'voice-maggi-kg', quantity: 1 }] },
    credit: creditBatch,
  }), /one customer event/u);
  assert.equal(await store.readReceipt('live', 'hinglish-two-customer-events-1:supplier'), null,
    'a batch with conflicting customer event types makes no supplier write');
  assert.equal(await store.readCustomerBalance('live', voiceCustomer.id), 10_000);
  await assert.rejects(store.recordHomeNoteBatch('live', 'hinglish-credit-rollback-1', {
    receipt: creditBatchReceipt,
    credit: { ...creditBatch, promise: { amountPaise: 10_000, dueDate: '2026-99-99', note: null } },
  }), /valid promise date/u);
  assert.equal(await store.readReceipt('live', 'hinglish-credit-rollback-1:supplier'), null,
    'an invalid promise rejects the entire supplier-credit batch');
  assert.equal(await store.readCustomerBalance('live', voiceCustomer.id), 10_000,
    'a failed promise does not change the confirmed customer balance');
  assert.equal((await store.listStockLevels('live')).find(({ catalogueItemId }) => catalogueItemId === 'voice-maggi-kg')?.quantity, 5,
    'a failed promise does not post supplier stock');
  await assert.rejects(store.recordHomeNoteBatch('live', 'hinglish-credit-customer-rollback-1', {
    receipt: creditBatchReceipt,
    credit: { ...creditBatch, event: { ...creditBatch.event, customerId: 'not-in-this-shop' } },
  }), /Choose a customer from this shop/u);
  assert.equal(await store.readReceipt('live', 'hinglish-credit-customer-rollback-1:supplier'), null,
    'a credit identity failure rolls back the supplier receipt already staged in the transaction');
  assert.equal((await store.listStockLevels('live')).find(({ catalogueItemId }) => catalogueItemId === 'voice-maggi-kg')?.quantity, 5);
  await store.reverseHomeNoteBatch('live', 'hinglish-credit-note-1');
  assert.equal(await store.readCustomerBalance('live', voiceCustomer.id), 0, 'one Undo reverses the customer credit balance');
  assert.equal((await store.listCustomerPromises('live', voiceCustomer.id)).find(({ relatedEventId }) => relatedEventId === 'hinglish-credit-note-1:credit')?.status, 'cancelled');
  assert.equal((await store.listStockLevels('live')).find(({ catalogueItemId }) => catalogueItemId === 'voice-maggi-kg')?.quantity, 0,
    'one Undo also reverses supplier stock from the same note');

  assert.equal((await store.listSuppliers('demo')).find(({ id }) => id === supplier.id)?.deliveryCount, 1,
    'reversing a stock receipt removes it from the active delivery count');

  const lotReceipts = await store.listDeliveryLotReceipts('demo', saved.id, '2026-11-24');
  assert.equal(lotReceipts.length, 2, 'receipt lot summaries keep each delivery line visible');
  const maggiLots = lotReceipts.find((entry) => entry.lineId === 'maggi-line');
  assert.deepEqual(maggiLots && {
    acceptedQuantity: maggiLots.acceptedQuantity,
    trackedQuantity: maggiLots.trackedQuantity,
    untrackedQuantity: maggiLots.untrackedQuantity,
    usableObservedQuantity: maggiLots.usableObservedQuantity,
    expiredQuantity: maggiLots.expiredQuantity,
    rejectedQuantity: maggiLots.rejectedQuantity,
  }, {
    acceptedQuantity: 10, trackedQuantity: 6, untrackedQuantity: 4,
    usableObservedQuantity: 4, expiredQuantity: 2, rejectedQuantity: 0,
  }, 'only owner-entered in-date accepted lots count as usable observed stock');
  const initialStock = (await store.listStockLevels('demo')).find((level) => level.catalogueItemId === 'maggi-70g')?.quantity;
  const rejectedLot = maggiLots?.lots.find((lot) => lot.batchCode === 'MAG-A');
  assert.ok(rejectedLot);
  const rejection = await store.rejectDeliveryLot('demo', 'reject-lot-operation', rejectedLot.id, 1, 'Owner observed damage after receipt');
  assert.equal(rejection.stockQuantityDelta, -1);
  assert.deepEqual((await store.listDeliveryLotRejections('demo', saved.id)).map((entry) => [entry.id, entry.quantity, entry.note]), [
    [rejection.id, 1, 'Owner observed damage after receipt'],
  ]);
  await assert.rejects(store.rejectDeliveryLot('demo', 'reject-lot-too-many', rejectedLot.id, 3, null), /Rejected quantity exceeds/u);
  assert.equal((await store.listStockLevels('demo')).find((level) => level.catalogueItemId === 'maggi-70g')?.quantity, (initialStock ?? 0) - 1,
    'rejecting received lot stock creates a distinct negative stock movement');
  const afterReject = (await store.listDeliveryLotReceipts('demo', saved.id, '2026-11-24')).find((entry) => entry.lineId === 'maggi-line');
  assert.deepEqual(afterReject && [afterReject.usableObservedQuantity, afterReject.expiredQuantity, afterReject.rejectedQuantity, afterReject.untrackedQuantity], [3, 2, 1, 4]);
  await assert.rejects(store.reverseDeliveryReconciliation('demo', saved.id), /Reverse lot rejection adjustments/u);
  const rejectionReversal = await store.reverseDeliveryLotRejection('demo', rejection.id, 'reverse-lot-rejection-operation');
  assert.equal(rejectionReversal.stockQuantityDelta, 1);
  assert.deepEqual(await store.listDeliveryLotRejections('demo', saved.id), [], 'reversing a lot rejection closes its active correction');
  assert.equal((await store.listStockLevels('demo')).find((level) => level.catalogueItemId === 'maggi-70g')?.quantity, initialStock);
  assert.equal((await store.listDeliveryLotReceipts('demo', saved.id, '2026-11-24')).find((entry) => entry.lineId === 'maggi-line')?.usableObservedQuantity, 4,
    'reversing rejection restores usable observed quantity');
  assert.deepEqual(await store.listDeliveryLotReceipts('live', saved.id, '2026-11-24'), [], 'lot observations are isolated by shop mode');
  await assert.rejects(store.confirmDeliveryReconciliation('demo', 'lots-over-accepted', {
    ...input,
    lines: [{ ...input.lines[0], lots: [{ quantity: 11, batchCode: 'TOO-MANY', expiryDate: null }] }],
  }), /Lot quantities exceed the accepted receipt quantity/u);
  await assert.rejects(
    store.linkDeliveryToSupplierOrder('demo', 'draft-order-link-2', purchaseOrder.id, saved.id),
    /Mark the order placed before linking/u,
    'a draft cannot be matched to an already-recorded receipt until the owner marks it placed',
  );
  const placedOrder = await store.markSupplierOrderPlaced('demo', purchaseOrder.id, 'purchase-order-place-1');
  assert.equal(placedOrder.status, 'placed');
  assert.ok(placedOrder.placedAt, 'placement date is only recorded after the owner action');
  assert.equal(await store.readSupplierBalance('demo', input.supplier), 34_000, 'marking an order placed does not change the confirmed invoice payable');
  assert.equal((await store.markSupplierOrderPlaced('demo', purchaseOrder.id, 'purchase-order-place-retry')).status, 'placed',
    'repeating the place action does not alter the order again');
  assert.equal(saved.lines.length, 2);
  assert.equal(saved.voiceNote, input.voiceNote);
  assert.deepEqual(saved.invoiceEvidenceUris, input.invoiceEvidenceUris);
  const afterReceipt = (await store.listRestockPlanning('demo')).find(({ catalogueItemId }) => catalogueItemId === 'maggi-70g');
  assert.equal(afterReceipt?.onHandQuantity, 10);
  assert.equal(afterReceipt?.suggestedQuantity, 2, 'a confirmed receipt changes the threshold suggestion through recorded stock');
  assert.equal(await store.readSupplierBalance('demo', input.supplier), 34_000);
  assert.equal((await store.listSuppliers('demo')).find((entry) => entry.id === supplier.id)?.balancePaise, 34_000);
  assert.equal(supplier.aliases.length, 2);
  assert.ok(supplier.aliases.includes('Sharma ji'));
  assert.ok(supplier.aliases.includes('S. K. Supply'));
  await assert.rejects(
    store.createSupplier('demo', { name: 'Another Wholesale', aliases: ['Sharma ji'] }),
    /already identifies Sharma Kirana Supply/u,
    'a supplier alias cannot attach to two profiles',
  );
  assert.equal((await store.listSuppliers('demo')).length, 1, 'a failed alias assignment rolls back the new supplier');
  assert.equal(await store.readSupplierBalance('demo', 'sharma   ji'), 34_000, 'supplier aliases resolve case and whitespace-insensitively');
  const invoices = await store.listSupplierInvoices('demo', supplier.id, '2026-11-24');
  assert.equal(invoices.length, 1);
  assert.equal(invoices[0].invoiceId, saved.id);
  assert.equal(invoices[0].dueDate, '2026-11-30');
  assert.equal(invoices[0].openPaise, 34_000, 'receipt-time payment is reflected in invoice open amount');
  assert.equal(invoices[0].status, 'not_due');
  assert.equal((await store.listSupplierInvoices('demo', supplier.id, '2026-12-01'))[0].status, 'overdue');
  assert.deepEqual(await store.listSupplierInvoices('live', supplier.id, '2026-11-24'), [], 'invoice aging stays shop isolated');

  const paymentInput = {
    supplierId: supplier.id, amountPaise: 10_000, paymentMethod: 'upi' as const, note: 'Part payment',
    allocations: [{ invoiceId: saved.id, amountPaise: 10_000 }],
  };
  const supplierPayment = await store.recordSupplierPayment('demo', 'supplier-payment-1', paymentInput);
  assert.equal(supplierPayment.amountDeltaPaise, -10_000);
  assert.equal(supplierPayment.unallocatedPaise, 0);
  assert.equal((await store.listSupplierInvoices('demo', supplier.id, '2026-11-24'))[0].openPaise, 24_000,
    'explicit invoice allocation reduces that invoice open amount');
  await assert.rejects(store.recordSupplierPayment('demo', 'over-allocate-invoice', {
    ...paymentInput, amountPaise: 25_000, allocations: [{ invoiceId: saved.id, amountPaise: 25_000 }],
  }), /exceeds the invoice amount remaining/u);
  assert.equal(await store.readSupplierBalance('demo', 'Sharma ji'), 24_000, 'a later partial payment reduces the payable');
  assert.equal((await store.recordSupplierPayment('demo', 'supplier-payment-1', paymentInput)).id, supplierPayment.id, 'payment retry does not post twice');
  await assert.rejects(store.recordSupplierPayment('demo', 'supplier-payment-1', { ...paymentInput, amountPaise: 20_000 }), /different details/u);
  const supplierPaymentReversal = await store.reverseSupplierPayment('demo', supplierPayment.id, 'supplier-payment-reversal-1');
  assert.equal(supplierPaymentReversal.kind, 'reversal');
  assert.equal((await store.listSupplierInvoices('demo', supplier.id, '2026-11-24'))[0].openPaise, 34_000,
    'payment reversal restores its invoice allocation');
  assert.equal(await store.readSupplierBalance('demo', 'Sharma ji'), 34_000, 'a linked payment reversal restores the prior payable');
  assert.equal((await store.reverseSupplierPayment('demo', supplierPayment.id, 'supplier-payment-reversal-retry')).id, supplierPaymentReversal.id);
  assert.equal((await store.listSupplierPaymentEvents('demo', supplier.id)).length, 2);
  const unallocated = await store.recordSupplierPayment('demo', 'supplier-payment-unallocated', {
    supplierId: supplier.id, amountPaise: 5_000, paymentMethod: 'cash', note: 'Advance', allocations: [],
  });
  assert.equal(unallocated.unallocatedPaise, 5_000, 'an unallocated payment remains supplier credit');
  assert.equal((await store.listSupplierInvoices('demo', supplier.id, '2026-11-24'))[0].openPaise, 34_000,
    'unallocated credit does not silently reduce invoice aging');
  assert.equal(await store.readSupplierBalance('demo', 'Sharma ji'), 29_000,
    'unallocated supplier credit still reduces the account-level balance');
  await assert.rejects(store.recordSupplierPayment('demo', 'over-allocate-payment', {
    supplierId: supplier.id, amountPaise: 5_000, paymentMethod: 'cash', note: null,
    allocations: [{ invoiceId: saved.id, amountPaise: 5_001 }],
  }), /allocations cannot exceed the payment amount/u);
  await assert.rejects(store.recordSupplierPayment('demo', 'wrong-supplier-invoice', {
    supplierId: supplier.id, amountPaise: 1_000, paymentMethod: 'cash', note: null,
    allocations: [{ invoiceId: 'not-an-invoice-in-this-shop', amountPaise: 500 }],
  }), /active invoice from this supplier/u);
  assert.deepEqual(
    rows(`SELECT catalogue_item_id, quantity_delta FROM delivery_stock_movement
          WHERE mode = 'demo' AND event_id = ? ORDER BY position`, saved.id)
      .map(({ catalogue_item_id, quantity_delta }) => [catalogue_item_id, quantity_delta]),
    [['maggi-70g', 10], ['surf-excel-500g', 6]],
  );
  assert.deepEqual(
    rows(`SELECT kind, quantity, status FROM delivery_discrepancy
          WHERE mode = 'demo' AND event_id = ? ORDER BY kind`, saved.id)
      .map(({ kind, quantity, status }) => [kind, quantity, status]),
    [['damaged', 1, 'pending'], ['missing', 1, 'pending']],
  );

  const linkedOrder = await store.linkDeliveryToSupplierOrder('demo', 'order-link-1', placedOrder.id, saved.id);
  assert.equal(linkedOrder.status, 'partially_received', 'a short delivery leaves the order open for the balance');
  assert.deepEqual(linkedOrder.lines.map(({ catalogueItemId, receivedQuantity, outstandingQuantity }) => [catalogueItemId, receivedQuantity, outstandingQuantity]), [
    ['maggi-70g', 11, 1], ['surf-excel-500g', 6, 0],
  ], 'only physically arrived units count toward ordered quantity; invoiced-but-missing units remain outstanding');
  assert.equal(await store.readSupplierBalance('demo', input.supplier), 29_000, 'linking an order does not change the payable after unallocated supplier credit');
  assert.equal((await store.linkDeliveryToSupplierOrder('demo', 'order-link-1', placedOrder.id, saved.id)).status, 'partially_received', 'receipt-link retries are idempotent');
  const cancelledOrder = await store.cancelSupplierOrder('demo', placedOrder.id, 'purchase-order-cancel-1');
  assert.equal(cancelledOrder.status, 'cancelled');
  assert.equal(cancelledOrder.lines[0].outstandingQuantity, 1, 'cancelling a partial order preserves its undelivered quantity in history');

  const repeated = await store.confirmDeliveryReconciliation('demo', 'integration-delivery-1', input);
  assert.equal(repeated.id, saved.id);
  assert.equal(rows("SELECT id FROM delivery_event WHERE mode = 'demo'").length, 1);
  await assert.rejects(
    store.confirmDeliveryReconciliation('demo', 'integration-delivery-1', { ...input, invoiceTotalPaise: 1 }),
    /already used for a different delivery/u,
  );

  const beforeRollback = rows("SELECT id FROM delivery_event WHERE mode = 'demo'").length;
  await assert.rejects(
    store.confirmDeliveryReconciliation('demo', 'integration-rollback', {
      ...input,
      lines: [{ ...input.lines[0], catalogItemId: 'missing-catalogue-item' }],
    }),
    /catalogue item changed/u,
  );
  assert.equal(rows("SELECT id FROM delivery_event WHERE mode = 'demo'").length, beforeRollback);
  assert.equal(rows("SELECT id FROM supplier_balance_entry WHERE mode = 'demo' AND event_id = 'integration-rollback'").length, 0);

  const persisted = await store.readDeliveryReconciliation('demo', saved.id);
  assert.equal(persisted?.lines[0].goodQuantity, 10);
  assert.equal(persisted?.voiceNote, input.voiceNote);
  assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.deepEqual(rows('PRAGMA foreign_key_check'), []);

  const ramesh = await store.createCustomer('demo', 'customer-ramesh', { name: 'Ramesh Sharma', aliases: ['Ramesh ji'] });
  const ramesh2 = await store.createCustomer('demo', 'customer-ramesh-dairy', { name: 'Ramesh Dairy', aliases: ['Ramesh ji'] });
  assert.equal((await store.findCustomersByAlias('demo', 'Ramesh ji')).length, 2, 'ambiguous aliases return candidates instead of merging customers');
  assert.equal((await store.listCustomers('demo')).length, 3, 'the earlier quantity-only Tinku sale does not prevent separate Ramesh profiles');

  const creditSale = await store.confirmCustomerCreditEvent('demo', 'credit-sale-1', {
    customerId: ramesh.id, kind: 'credit_sale', amountPaise: 35_000,
    paymentMethod: null, note: 'Groceries', sourceText: 'Ramesh ko 350 ka samaan udhaar likho',
  });
  const promise = await store.createPromiseToPay('demo', 'promise-1', {
    customerId: ramesh.id, amountPaise: 35_000, dueDate: '2026-11-28', note: null, relatedEventId: creditSale.id,
  });
  assert.equal(promise.status, 'open');
  assert.equal(await store.readCustomerBalance('demo', ramesh.id), 35_000, 'a promise does not change the balance');

  const itemizedCredit = await store.confirmCustomerCreditEvent('demo', 'credit-sale-itemized-1', {
    customerId: ramesh.id, kind: 'credit_sale', amountPaise: 10_000,
    paymentMethod: null, note: null, sourceText: 'Ramesh ko Maggi aur Surf udhaar diya',
    lines: [
      { catalogueItemId: 'maggi-70g', quantity: 2, amountPaise: 2_000 },
      { catalogueItemId: 'surf-excel-500g', quantity: 1, amountPaise: 8_000 },
    ],
  });
  assert.equal((await store.listCustomerCreditEvents('demo', ramesh.id)).find(({ id }) => id === itemizedCredit.id)?.lines.length, 2);
  assert.equal((await store.confirmCustomerCreditEvent('demo', 'credit-sale-itemized-1', {
    customerId: ramesh.id, kind: 'credit_sale', amountPaise: 10_000,
    paymentMethod: null, note: null, sourceText: 'Ramesh ko Maggi aur Surf udhaar diya',
    lines: [
      { catalogueItemId: 'maggi-70g', quantity: 2, amountPaise: 2_000 },
      { catalogueItemId: 'surf-excel-500g', quantity: 1, amountPaise: 8_000 },
    ],
  })).id, itemizedCredit.id, 'retrying an itemized credit save does not post stock twice');
  assert.deepEqual((await store.listStockLevels('demo')).map(({ catalogueItemId, quantity }) => ({ catalogueItemId, quantity }))
    .sort((left, right) => left.catalogueItemId.localeCompare(right.catalogueItemId)), [
    { catalogueItemId: 'bisleri-1l', quantity: 0 },
    { catalogueItemId: 'maggi-280g', quantity: 0 },
    { catalogueItemId: 'maggi-70g', quantity: 8 },
    { catalogueItemId: 'parle-g-90g', quantity: 0 },
    { catalogueItemId: 'surf-excel-1kg', quantity: 0 },
    { catalogueItemId: 'surf-excel-500g', quantity: 5 },
  ], 'a confirmed itemized credit sale reduces the same catalog stock the shop tracks');
  assert.equal(await store.readCustomerBalance('demo', ramesh.id), 45_000);
  await store.reverseCustomerCreditEvent('demo', itemizedCredit.id, 'credit-sale-itemized-reversal-1');
  assert.equal(await store.readCustomerBalance('demo', ramesh.id), 35_000);
  assert.equal((await store.listStockLevels('demo')).find(({ catalogueItemId }) => catalogueItemId === 'maggi-70g')?.quantity, 10,
    'reversing the credit sale restores its sold stock without erasing the original event');
  await assert.rejects(store.confirmCustomerCreditEvent('demo', 'credit-sale-itemized-invalid', {
    customerId: ramesh.id, kind: 'credit_sale', amountPaise: 10_000,
    paymentMethod: null, note: null, sourceText: null,
    lines: [{ catalogueItemId: 'maggi-70g', quantity: 1, amountPaise: 9_999 }],
  }), /line amounts must equal the credit sale amount/u);
  assert.equal(await store.readCustomerBalance('demo', ramesh.id), 35_000, 'an itemization mismatch must not create a partial event');
  await assert.rejects(store.confirmCustomerCreditEvent('demo', 'credit-sale-itemized-missing-product', {
    customerId: ramesh.id, kind: 'credit_sale', amountPaise: 10_000,
    paymentMethod: null, note: null, sourceText: null,
    lines: [{ catalogueItemId: 'missing-product', quantity: 1, amountPaise: 10_000 }],
  }), /product from this shop catalogue/u);
  assert.equal(await store.readCustomerBalance('demo', ramesh.id), 35_000, 'an unknown product leaves no balance event');
  assert.equal((await store.listStockLevels('demo')).find(({ catalogueItemId }) => catalogueItemId === 'maggi-70g')?.quantity, 10,
    'a failed event leaves stock unchanged');
  await assert.rejects(store.confirmCustomerCreditEvent('demo', 'credit-sale-itemized-out-of-stock', {
    customerId: ramesh.id, kind: 'credit_sale', amountPaise: 1,
    paymentMethod: null, note: null, sourceText: null,
    lines: [{ catalogueItemId: 'maggi-70g', quantity: 11, amountPaise: 1 }],
  }), /Not enough Maggi Masala Noodles \(70 g\) in recorded stock/u);
  assert.equal(await store.readCustomerBalance('demo', ramesh.id), 35_000, 'an out-of-stock itemized sale does not change the balance');

  const repayment = await store.confirmCustomerCreditEvent('demo', 'repayment-1', {
    customerId: ramesh.id, kind: 'repayment_received', amountPaise: 20_000,
    paymentMethod: 'upi', note: null, sourceText: 'Ramesh ne 200 UPI diye',
  });
  assert.equal(repayment.amountDeltaPaise, -20_000);
  assert.equal(await store.readCustomerBalance('demo', ramesh.id), 15_000, 'partial repayment leaves the deterministic remainder');
  assert.equal((await store.confirmCustomerCreditEvent('demo', 'repayment-1', {
    customerId: ramesh.id, kind: 'repayment_received', amountPaise: 20_000,
    paymentMethod: 'upi', note: null, sourceText: 'Ramesh ne 200 UPI diye',
  })).id, repayment.id, 'retrying an identical operation is idempotent');
  await assert.rejects(store.confirmCustomerCreditEvent('demo', 'repayment-1', {
    customerId: ramesh.id, kind: 'repayment_received', amountPaise: 30_000,
    paymentMethod: 'upi', note: null, sourceText: 'different payload',
  }), /already used for a different customer entry/u);
  const reversedRepayment = await store.reverseCustomerCreditEvent('demo', repayment.id, 'reversal-1');
  assert.equal(reversedRepayment.amountDeltaPaise, 20_000);
  assert.equal(await store.readCustomerBalance('demo', ramesh.id), 35_000);
  assert.equal((await store.reverseCustomerCreditEvent('demo', repayment.id, 'reversal-retry')).id, reversedRepayment.id);
  assert.equal((await store.listCustomerPromises('demo', ramesh.id)).length, 1);

  const correctionCustomer = await store.createCustomer('demo', 'customer-followup-correction', { name: 'Followup QA', aliases: [] });
  const estimated = await store.confirmCustomerCreditEventWithPromise('demo', 'correction-credit', {
    customerId: correctionCustomer.id, kind: 'credit_sale', amountPaise: 10_000,
    paymentMethod: null, note: null, sourceText: 'Credit given',
  }, 'correction-estimate', { amountPaise: 10_000, dueDate: '2026-12-03', note: null, dateSource: 'estimated' });
  const corrected = await store.correctCustomerPromiseDate('demo', estimated.promise.id, 'correction-fixed', '2026-12-05');
  assert.equal(corrected.dueDate, '2026-12-05');
  assert.equal(corrected.dateSource, 'owner');
  assert.equal(corrected.relatedEventId, estimated.event.id);
  assert.equal(corrected.replacesPromiseId, estimated.promise.id);
  const readCorrection = (await store.listCustomerPromises('demo', correctionCustomer.id)).find((item) => item.id === corrected.id);
  assert.equal(readCorrection?.dateSource, 'owner');
  assert.equal(readCorrection?.replacesPromiseId, estimated.promise.id);
  assert.equal((await store.listCustomerPromises('demo', correctionCustomer.id)).find((item) => item.id === estimated.promise.id)?.status, 'cancelled');
  assert.equal(await store.readCustomerBalance('demo', correctionCustomer.id), 10_000);
  assert.equal((await store.correctCustomerPromiseDate('demo', estimated.promise.id, 'correction-fixed', '2026-12-05')).id, corrected.id);
  await assert.rejects(store.correctCustomerPromiseDate('demo', estimated.promise.id, 'different-correction', '2026-12-06'), /no longer open/u);
  await assert.rejects(store.correctCustomerPromiseDate('demo', corrected.id, 'bad-date', '2026-99-99'), /valid promise date/u);
  await assert.rejects(store.correctCustomerPromiseDate('demo', estimated.promise.id, 'correction-fixed', '2026-12-06'), /already used/u);
  assert.equal((await store.listCustomerPromises('demo', correctionCustomer.id)).find((item) => item.id === corrected.id)?.status, 'open');
  await store.reverseCustomerCreditEvent('demo', estimated.event.id, 'correction-credit-reversal');
  assert.equal((await store.listCustomerPromises('demo', correctionCustomer.id)).find((item) => item.id === corrected.id)?.status, 'cancelled');
  assert.equal(await store.readCustomerBalance('demo', correctionCustomer.id), 0);

  const sita = await store.createCustomer('demo', 'customer-sita', { name: 'Sita Devi', aliases: ['Sita ji'] });
  const paired = await store.confirmCustomerCreditEventWithPromise('demo', 'paired-credit-operation', {
    customerId: sita.id, kind: 'credit_sale', amountPaise: 35_000,
    paymentMethod: null, note: 'Groceries', sourceText: 'Sita ji ko 350 udhaar, Friday ko denge',
  }, 'paired-promise-operation', {
    amountPaise: 35_000, dueDate: '2026-11-28', note: 'Friday',
  });
  assert.equal(await store.readCustomerBalance('demo', sita.id), 35_000);
  assert.equal(paired.promise.relatedEventId, paired.event.id, 'the reviewed promise links to the credit event it came with');
  assert.equal((await store.confirmCustomerCreditEventWithPromise('demo', 'paired-credit-operation', {
    customerId: sita.id, kind: 'credit_sale', amountPaise: 35_000,
    paymentMethod: null, note: 'Groceries', sourceText: 'Sita ji ko 350 udhaar, Friday ko denge',
  }, 'paired-promise-operation', {
    amountPaise: 35_000, dueDate: '2026-11-28', note: 'Friday',
  })).promise.id, paired.promise.id, 'retrying the combined save is idempotent');
  await assert.rejects(store.confirmCustomerCreditEventWithPromise('demo', 'paired-rollback-operation', {
    customerId: sita.id, kind: 'credit_sale', amountPaise: 5_000,
    paymentMethod: null, note: null, sourceText: null,
  }, 'paired-invalid-promise', {
    amountPaise: null, dueDate: '2026-99-99', note: null,
  }), /valid promise date/u);
  assert.equal(await store.readCustomerBalance('demo', sita.id), 35_000, 'an invalid linked promise rolls back the credit event');
  await store.reverseCustomerCreditEvent('demo', paired.event.id, 'paired-credit-reversal');
  assert.equal(await store.readCustomerBalance('demo', sita.id), 0, 'undoing a home credit note reverses the balance entry');
  assert.equal((await store.listCustomerPromises('demo', sita.id).then((promises) => promises.find(({ id }) => id === paired.promise.id)))?.status, 'cancelled',
    'undoing the linked note cancels its still-open promise in the same transaction');
  assert.deepEqual(rows('PRAGMA foreign_key_check'), []);

  const reversed = await store.reverseDeliveryReconciliation('demo', saved.id);
  assert.ok(reversed.reversedAt);
  assert.deepEqual(await store.listDeliveryLotReceipts('demo', saved.id, '2026-11-24'), [], 'reversed delivery lots no longer contribute to observed quantities');
  assert.equal(await store.readSupplierBalance('demo', input.supplier), -5_000,
    'reversing the invoice preserves the separate unallocated supplier credit');
  assert.deepEqual(
    rows(`SELECT quantity_delta FROM delivery_reversal_stock_movement
          WHERE mode = 'demo' AND reversal_id = (SELECT id FROM delivery_reversal WHERE mode = 'demo' AND reverses_event_id = ?)
          ORDER BY position`, saved.id).map(({ quantity_delta }) => quantity_delta),
    [-10, -6],
  );
  assert.equal(rows("SELECT status FROM delivery_discrepancy WHERE mode = 'demo' AND event_id = 'integration-delivery-1' AND status = 'voided'").length, 2);
  assert.ok(await store.readDeliveryReconciliation('demo', saved.id));
  const aliasDelivery = await store.confirmDeliveryReconciliation('demo', 'integration-delivery-alias', {
    ...input, supplier: 'Sharma ji', invoiceNumber: 'DF-2402', invoiceTotalPaise: 20_000,
    amountPaidPaise: null, paymentMethod: null,
  });
  assert.equal(aliasDelivery.supplier, input.supplier, 'a saved alias resolves to the shop-approved supplier name');
  assert.equal(await store.readSupplierBalance('demo', input.supplier), 15_000,
    'a newly confirmed invoice nets against the existing unallocated supplier credit');
  const listedSupplier = (await store.listSuppliers('demo')).find(({ id }) => id === supplier.id);
  assert.equal(listedSupplier?.deliveryCount, 2);
  assert.equal(listedSupplier?.balancePaise, 15_000);
  await store.reverseDeliveryReconciliation('demo', aliasDelivery.id);
  assert.equal(await store.readSupplierBalance('demo', input.supplier), -5_000);

  const firstShop = await store.createShopProfile('Rakhi General Store', 'en');
  await store.writeShopProfile({ ...firstShop, setupComplete: true });
  await store.writeWisprSetupStep('ready');
  await store.saveCatalogItem('live', {
    id: 'first-only', name: 'First shop item', packSize: '70', unit: 'packet', aliases: [],
    barcode: '8901058000290', brand: 'Nestlé', packageContent: '70', catalogueSource: 'open_food_facts',
    imageUri: 'file:///shop/product-photos/first-only.jpg',
  });
  const secondShop = await store.createShopProfile('Corner Kirana', 'hi');
  assert.notEqual(secondShop.id, firstShop.id);
  assert.deepEqual(await store.listCustomers('live'), [], 'a new shop must not inherit another shop’s customer records');
  assert.equal(await store.readWisprSetupStep(), 'ready', "Wispr setup is device-level and shared by the owner's shop profiles");
  assert.deepEqual((await store.listCatalog('live')).map((item) => item.id), [], 'a new shop must not inherit another shop catalogue');
  assert.deepEqual(await store.listDeliveryReconciliations('demo'), [], 'a new shop must not inherit another shop delivery history');
  assert.deepEqual(await store.listSuppliers('demo'), [], 'a new shop must not inherit supplier profiles or aliases');
  assert.equal(await store.readSupplierBalance('demo', input.supplier), 0, 'a new shop must not inherit another shop supplier balances');
  await store.writeShopProfile({ ...secondShop, setupComplete: true });
  await store.saveCatalogItem('live', { id: 'second-only', name: 'Second shop item', packSize: '1 bottle', unit: 'bottle', aliases: [] });
  assert.deepEqual((await store.listShopProfiles()).map((shop) => shop.name), ['Rakhi General Store', 'Corner Kirana']);
  const activeShopBeforeInvalidSelection = await store.readActiveShopId();
  const firstShopFiles = await store.readShopAttachmentReferences(firstShop.id);
  assert.ok(firstShopFiles.invoices.includes(input.invoiceEvidenceUris[0]), 'reversed and demo deliveries retain their invoice references');
  assert.deepEqual(firstShopFiles.products, ['file:///shop/product-photos/first-only.jpg']);
  assert.deepEqual(await store.readShopAttachmentReferences(secondShop.id), { invoices: [], products: [] });
  assert.equal(await store.readActiveShopId(), secondShop.id, 'checking another shop does not change the active shop');
  await assert.rejects(store.selectShopProfile('missing-shop'), /no longer available/);
  assert.equal(await store.readActiveShopId(), activeShopBeforeInvalidSelection,
    'a failed profile selection must not move the persistent active-shop pointer');
  database.prepare(`INSERT INTO shop_workspace (id, name, language, setup_complete, created_at)
    VALUES (?, ?, 'en', 1, ?)`).run('unreadable-shop', 'Unavailable shop', new Date().toISOString());
  await assert.rejects(store.selectShopProfile('unreadable-shop'), /Could not open/u);
  const incompleteSnapshot = mkdtempSync(join(directory, 'incomplete-backup-'));
  await assert.rejects(store.snapshotShopDatabases(incompleteSnapshot), /registered shop profile is unavailable/u);
  assert.deepEqual(readdirSync(incompleteSnapshot), [], 'a failed snapshot removes its partial database copies');
  assert.equal(await store.readActiveShopId(), secondShop.id, 'a registry row without a shop profile must not become active');
  assert.deepEqual((await store.listCatalog('live')).map((item) => item.id), ['second-only'],
    'a failed profile read must preserve the shop targeted by subsequent operations');
  database.prepare('DELETE FROM shop_workspace WHERE id = ?').run('unreadable-shop');
  await store.selectShopProfile(firstShop.id);
  const firstShopCatalog = await store.listCatalog('live');
  assert.deepEqual(firstShopCatalog.map((item) => item.id), [
    'first-only', 'voice-maggi-kg', 'voice-maggi-packet', 'voice-milk-500ml', 'voice-milk-carton',
  ], 'the first registered shop keeps the existing default workspace catalog');
  assert.deepEqual(
    (({ barcode, brand, packageContent, catalogueSource, imageUri, packSize, unit }) => ({ barcode, brand, packageContent, catalogueSource, imageUri, packSize, unit }))(firstShopCatalog[0]!),
    {
      barcode: '8901058000290', brand: 'Nestlé', packageContent: '70', catalogueSource: 'open_food_facts',
      imageUri: 'file:///shop/product-photos/first-only.jpg', packSize: '70', unit: 'packet',
    },
    'the exact barcode suggestion, owner-selected receiving unit, and local photo URI persist per shop',
  );
  assert.equal(await store.readActiveShopId(), firstShop.id);
  const snapshotDirectory = mkdtempSync(join(directory, 'backup-'));
  const snapshots = await store.snapshotShopDatabases(snapshotDirectory);
  assert.equal(snapshots.length, 2, 'the default shop and registry share one snapshot');
  assert.deepEqual(snapshots.map(({ shopId, registry }) => [shopId, registry]), [[firstShop.id, true], [secondShop.id, false]]);
  for (const entry of snapshots) {
    const copy = new DatabaseSync(join(snapshotDirectory, entry.filename), { readOnly: true });
    try {
      assert.equal(copy.prepare('PRAGMA quick_check').get()?.quick_check, 'ok');
      const products = copy.prepare("SELECT id FROM catalogue_item WHERE mode = 'live' ORDER BY id").all().map(({ id }) => id);
      assert.deepEqual(products, entry.registry ? firstShopCatalog.map(({ id }) => id).sort() : ['second-only']);
      if (entry.registry) {
        assert.equal(copy.prepare('SELECT COUNT(*) AS count FROM shop_workspace').get()?.count, 2);
        assert.equal(copy.prepare("SELECT COUNT(*) AS count FROM delivery_event WHERE id = 'integration-delivery-1'").get()?.count, 1,
          'the snapshot retains reversed delivery history for recovery');
      }
    } finally {
      copy.close();
    }
  }
  assert.equal(await store.readActiveShopId(), firstShop.id, 'snapshotting does not switch the active shop');
  const unnamedShop = await store.createShopProfile('', 'en');
  await store.writeShopProfile({ ...unnamedShop, setupComplete: true });
  assert.deepEqual(
    (await store.listShopProfiles()).map(({ name, setupComplete }) => ({ name, setupComplete })),
    [
      { name: 'Rakhi General Store', setupComplete: true },
      { name: 'Corner Kirana', setupComplete: true },
      { name: '', setupComplete: true },
    ],
    'the owner can start without naming the shop and add a display name later',
  );
});
