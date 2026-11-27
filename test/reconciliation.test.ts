import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extraQuantity,
  lineDifference,
  missingQuantity,
  validateDeliveryReconciliation,
  type DeliveryReconciliationDraft,
} from '../src/reconciliation-domain.ts';

const catalog = new Map([
  ['maggi-70g', { name: 'Maggi Masala Noodles', packSize: '70 g', unit: 'packet' as const }],
  ['surf-1kg', { name: 'Surf Excel', packSize: '1 kg', unit: 'packet' as const }],
]);

function draft(overrides: Partial<DeliveryReconciliationDraft> = {}): DeliveryReconciliationDraft {
  return {
    id: 'delivery-1',
    supplier: 'Sharma Foods',
    invoiceNumber: 'SF-2048',
    invoiceDate: '2026-11-23',
    invoiceTotalPaise: 100_800,
    amountPaidPaise: 50_000,
    paymentMethod: 'cash',
    documentUri: null,
    lines: [{
      id: 'invoice-line-1', kind: 'invoice', relatedInvoiceLineId: null,
      description: 'Maggi Masala 70 g', catalogItemId: 'maggi-70g',
      catalogName: 'Maggi Masala Noodles', packSize: '70 g', unit: 'packet',
      billedQuantity: 12, receivedGoodQuantity: 9, damagedQuantity: 1,
      unitPricePaise: 1_400, lineTotalPaise: 16_800,
      evidenceText: 'Maggi Masala 70g 12 14.00 168.00', evidenceConfidence: 0.94,
    }],
    ...overrides,
  };
}

test('invoice shortages exclude physically arrived damaged quantity', () => {
  const line = draft().lines[0];
  assert.equal(missingQuantity(line), 2);
  assert.equal(extraQuantity(line), 0);
  assert.deepEqual(lineDifference(line), {
    lineId: 'invoice-line-1', missingQuantity: 2, extraQuantity: 0, damagedQuantity: 1,
  });
});

test('over-delivery remains visible and is not collapsed into billed quantity', () => {
  const line = { ...draft().lines[0], receivedGoodQuantity: 14, damagedQuantity: 0 };
  assert.equal(missingQuantity(line), 0);
  assert.equal(extraQuantity(line), 2);
});

test('extra goods are separate from invoice quantities', () => {
  const extra = {
    ...draft().lines[0], id: 'extra-1', kind: 'extra' as const,
    relatedInvoiceLineId: null, description: 'Surf Excel 1 kg extra',
    catalogItemId: 'surf-1kg', catalogName: 'Surf Excel', packSize: '1 kg',
    billedQuantity: 0, receivedGoodQuantity: 3, damagedQuantity: 1,
    unitPricePaise: null, lineTotalPaise: null,
  };
  assert.equal(missingQuantity(extra), 0);
  assert.equal(extraQuantity(extra), 4);
  assert.deepEqual(validateDeliveryReconciliation(draft({ lines: [draft().lines[0], extra] }), catalog), []);
});

test('confirmation requires exact catalogue resolution and valid OCR evidence', () => {
  const unresolved = { ...draft().lines[0], catalogItemId: null, catalogName: null, packSize: null, unit: null };
  assert.ok(validateDeliveryReconciliation(draft({ lines: [unresolved] }), catalog)
    .some((issue) => issue.includes('exact catalogue item')));

  const invalidConfidence = { ...draft().lines[0], evidenceConfidence: 1.2 };
  assert.ok(validateDeliveryReconciliation(draft({ lines: [invalidConfidence] }), catalog)
    .some((issue) => issue.includes('OCR confidence')));
});

test('unknown invoice total and payment remain unknown instead of being inferred', () => {
  const value = draft({ invoiceTotalPaise: null, amountPaidPaise: null, paymentMethod: null });
  assert.deepEqual(validateDeliveryReconciliation(value, catalog), []);
  assert.equal(value.invoiceTotalPaise, null);
  assert.equal(value.amountPaidPaise, null);
});
