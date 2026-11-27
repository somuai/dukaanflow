import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const directory = mkdtempSync(join(tmpdir(), 'dukaanflow-claims-'));
const databasePath = join(directory, 'dukaanflow.db');
process.env.DUKAANFLOW_TEST_DB_PATH = databasePath;
const store = await import('../src/store.ts');
const database = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });

const deliveryInput = {
  supplier: 'Sharma Wholesale', invoiceNumber: 'SW-101', invoiceDate: '2026-11-24', dueDate: '2026-12-01',
  invoiceEvidenceUris: [], invoiceTotalPaise: 20_000, amountPaidPaise: null, paymentMethod: null,
  lines: [{ lineId: 'maggi-line', catalogItemId: 'maggi-70g', name: 'Maggi Masala Noodles', packSize: '70 g', unit: 'packet' as const,
    billedQuantity: 10, goodQuantity: 8, damagedQuantity: 1, missingQuantity: 1, extraQuantity: 0, acceptedExtraQuantity: 0 }],
};

test('supplier claims stay inert until confirmed stock return or credit note events', async (t) => {
  t.after(() => { database.close(); rmSync(directory, { recursive: true, force: true }); });
  const delivery = await store.confirmDeliveryReconciliation('demo', 'claim-fixture-delivery', deliveryInput);
  assert.equal(database.prepare('PRAGMA user_version').get().user_version, 17);
  assert.equal((await store.listStockLevels('demo')).find((item) => item.catalogueItemId === 'maggi-70g')?.quantity, 8);
  assert.equal(await store.readSupplierBalance('demo', deliveryInput.supplier), 20_000);

  const claim = await store.createSupplierClaim('demo', 'claim-damaged-1', {
    deliveryId: delivery.id, lineId: 'maggi-line', kind: 'damaged', quantity: 1, note: 'Packet torn at delivery',
  });
  assert.equal(claim.status, 'open');
  assert.equal(await store.readSupplierBalance('demo', deliveryInput.supplier), 20_000, 'opening a claim does not change supplier balance');
  assert.equal((await store.listStockLevels('demo')).find((item) => item.catalogueItemId === 'maggi-70g')?.quantity, 8,
    'opening a claim does not change stock');
  await assert.rejects(store.reverseDeliveryReconciliation('demo', delivery.id), /Resolve or close the delivery claims/u,
    'the whole invoice cannot be reversed while its supplier claim remains open');
  assert.equal((await store.createSupplierClaim('demo', 'claim-damaged-1', {
    deliveryId: delivery.id, lineId: 'maggi-line', kind: 'damaged', quantity: 1, note: 'Packet torn at delivery',
  })).id, claim.id, 'retrying claim creation returns the same claim');
  await assert.rejects(store.createSupplierClaim('demo', 'claim-excess', {
    deliveryId: delivery.id, lineId: 'maggi-line', kind: 'damaged', quantity: 2, note: null,
  }), /exceeds the unclaimed discrepancy/u);

  const promised = await store.recordSupplierClaimResponse('demo', 'claim-response-1', claim.id, 'credit_promised', 'Credit next visit');
  assert.equal(promised.status, 'credit_promised');
  assert.equal(await store.readSupplierBalance('demo', deliveryInput.supplier), 20_000, 'a promise is not a credit note');
  const damagedReturn = await store.recordSupplierClaimReturn('demo', 'claim-return-damaged-1', claim.id, 1, 'Returned to Sharma ji');
  assert.equal(damagedReturn.quantity, 1);
  assert.equal((await store.listStockLevels('demo')).find((item) => item.catalogueItemId === 'maggi-70g')?.quantity, 8,
    'returning damaged goods that never entered usable stock posts no stock decrement');
  assert.equal(await store.readSupplierBalance('demo', deliveryInput.supplier), 20_000,
    'handing goods back does not automatically reduce the payable');

  const credited = await store.recordSupplierClaimCreditNote('demo', 'claim-credit-note-1', claim.id, {
    amountPaise: 2_000, reference: 'CN-11', note: 'Supplier credit note received',
  });
  assert.equal(credited.status, 'resolved_credit_note');
  assert.equal(await store.readSupplierBalance('demo', deliveryInput.supplier), 18_000);
  await assert.rejects(store.reverseDeliveryReconciliation('demo', delivery.id), /Reverse confirmed claim credit notes/u,
    'the original invoice cannot be reversed while a confirmed supplier credit note is still active');
  assert.equal((await store.listSupplierInvoices('demo', (await store.listSuppliers('demo'))[0].id, '2026-11-24'))[0].openPaise, 18_000,
    'a confirmed credit note reduces the linked invoice outstanding amount');
  assert.equal((await store.recordSupplierClaimCreditNote('demo', 'claim-credit-note-1', claim.id, {
    amountPaise: 2_000, reference: 'CN-11', note: 'Supplier credit note received',
  })).id, credited.id, 'retrying credit-note confirmation does not apply it twice');

  const creditReversal = await store.reverseSupplierClaimCreditNote('demo', 'claim-credit-note-1', 'claim-credit-reversal-1');
  assert.equal(creditReversal.amountDeltaPaise, 2_000);
  assert.equal(await store.readSupplierBalance('demo', deliveryInput.supplier), 20_000);
  assert.equal((await store.listSupplierInvoices('demo', (await store.listSuppliers('demo'))[0].id, '2026-11-24'))[0].openPaise, 20_000,
    'reversing a credit note restores the linked invoice amount');
  assert.equal((await store.reverseSupplierClaimCreditNote('demo', 'claim-credit-note-1', 'claim-credit-reversal-retry')).id, creditReversal.id);

  const returnClaim = await store.createSupplierClaim('demo', 'claim-return-1', {
    deliveryId: delivery.id, lineId: 'maggi-line', kind: 'return', quantity: 2, note: 'Owner-approved return of saleable packets',
  });
  const saleableReturn = await store.recordSupplierClaimReturn('demo', 'claim-return-saleable-1', returnClaim.id, 2, null);
  assert.equal(saleableReturn.stockQuantityDelta, -2);
  assert.equal((await store.listStockLevels('demo')).find((item) => item.catalogueItemId === 'maggi-70g')?.quantity, 6,
    'a confirmed return of usable goods removes only the returned quantity from stock');
  assert.equal(await store.readSupplierBalance('demo', deliveryInput.supplier), 20_000,
    'stock return and supplier credit are separate confirmed events');
  await assert.rejects(store.recordSupplierClaimReturn('demo', 'claim-return-overflow', returnClaim.id, 1, null), /exceeds the open claim quantity/u);
  await store.closeSupplierClaim('demo', claim.id, 'claim-close-damaged-before-reversal', 'Supplier resolved outside the app');
  await store.closeSupplierClaim('demo', returnClaim.id, 'claim-close-return-before-reversal', 'Return completed');
  await assert.rejects(store.reverseDeliveryReconciliation('demo', delivery.id), /Reverse confirmed claim credit notes and stock returns/u,
    'the source receipt cannot be reversed while a confirmed stock return is still active');
  const returnReversal = await store.reverseSupplierClaimReturn('demo', saleableReturn.id, 'claim-return-stock-reversal-1');
  assert.equal(returnReversal.quantityDelta, 2);
  assert.equal((await store.listStockLevels('demo')).find((item) => item.catalogueItemId === 'maggi-70g')?.quantity, 8);
  assert.equal(await store.readSupplierBalance('demo', deliveryInput.supplier), 20_000);
  assert.equal((await store.reverseSupplierClaimReturn('demo', saleableReturn.id, 'claim-return-stock-reversal-retry')).id, returnReversal.id);
  assert.deepEqual(await store.listSupplierClaims('live', delivery.id), [], 'claims are isolated by shop mode');
  await store.closeSupplierClaim('demo', returnClaim.id, 'claim-close-return-1', 'Returned items were taken back');

  const replacement = await store.confirmDeliveryReconciliation('demo', 'claim-replacement-delivery', {
    ...deliveryInput, invoiceNumber: 'SW-102', invoiceTotalPaise: 0, lines: [{ ...deliveryInput.lines[0], lineId: 'replacement-line',
      billedQuantity: 0, goodQuantity: 0, damagedQuantity: 0, missingQuantity: 0, extraQuantity: 1, acceptedExtraQuantity: 1 }],
  });
  const missingClaim = await store.createSupplierClaim('demo', 'claim-missing-1', {
    deliveryId: delivery.id, lineId: 'maggi-line', kind: 'missing', quantity: 1, note: null,
  });
  const beforeReplacementLinkStock = (await store.listStockLevels('demo')).find((item) => item.catalogueItemId === 'maggi-70g')?.quantity;
  const replacementResolved = await store.recordSupplierClaimReplacement('demo', 'claim-replacement-link-1', missingClaim.id, replacement.id, 'replacement-line');
  assert.equal(replacementResolved.status, 'resolved_replacement');
  assert.equal((await store.listStockLevels('demo')).find((item) => item.catalogueItemId === 'maggi-70g')?.quantity, beforeReplacementLinkStock,
    'linking an already-confirmed replacement receipt does not duplicate stock');
  assert.equal(await store.readSupplierBalance('demo', deliveryInput.supplier), 20_000,
    'replacement linkage itself does not change supplier balance');
  assert.equal((await store.recordSupplierClaimReplacement('demo', 'claim-replacement-link-1', missingClaim.id, replacement.id, 'replacement-line')).id, replacementResolved.id);
  await store.reverseDeliveryReconciliation('demo', replacement.id);
  assert.equal((await store.readSupplierClaim('demo', missingClaim.id))?.status, 'open',
    'reversing the replacement receipt reopens the original claim instead of leaving a false resolution');
  assert.equal((await store.listStockLevels('demo')).find((item) => item.catalogueItemId === 'maggi-70g')?.quantity, (beforeReplacementLinkStock ?? 0) - 1,
    'reversing the replacement receipt removes its confirmed stock exactly once');
  await store.closeSupplierClaim('demo', missingClaim.id, 'claim-close-missing-1', 'Owner closed after replacement was reversed');
  await store.reverseDeliveryReconciliation('demo', delivery.id);
  assert.equal((await store.listStockLevels('demo')).find((item) => item.catalogueItemId === 'maggi-70g')?.quantity, 0,
    'reversing the original receipt after claim adjustments are cleared does not double reverse stock');
  assert.equal(await store.readSupplierBalance('demo', deliveryInput.supplier), 0,
    'the original invoice reverses independently from already-reversed claim adjustments');
  assert.ok((await store.readSupplierClaim('demo', claim.id))?.status === 'voided', 'reversing the source delivery voids its old claim history');
  assert.deepEqual(rows('PRAGMA foreign_key_check'), []);
});

function rows(sql: string) { return database.prepare(sql).all(); }
