import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_CATALOG, type CatalogItem } from '../src/domain.ts';
import { extractInvoice, joinInvoiceOCRBlocks } from '../src/invoice-domain.ts';

const FIXTURE_TEXT = `SHARMA GROCERS
Invoice No. DF-2401
Date 23 Nov 2026
Supplier: Sharma Kirana Supply
ITEM QTY RATE AMOUNT
Maggi Masala Noodles 70 g 12 50.00 600.00
Surf Excel Detergent 500 g 6 40.00 240.00
Subtotal 840.00
TOTAL INR 840.00
Paid by cash 500.00
Balance due 340.00`;

test('invoice OCR proposes fixture values while physical quantities stay unset', () => {
  const invoice = extractInvoice(FIXTURE_TEXT, DEMO_CATALOG);
  assert.equal(invoice.supplier, 'Sharma Kirana Supply');
  assert.equal(invoice.invoiceNumber, 'DF-2401');
  assert.equal(invoice.invoiceDate, '23 Nov 2026');
  assert.equal(invoice.totalPaise, 84_000);
  assert.equal(invoice.paidPaise, 50_000);
  assert.deepEqual(invoice.lines.map((line) => [line.catalogueItemId, line.billedQuantity, line.unitPricePaise, line.lineTotalPaise]), [
    ['maggi-70g', 12, 5_000, 60_000],
    ['surf-excel-500g', 6, 4_000, 24_000],
  ]);
  assert.ok(invoice.lines.every((line) => line.confidence === 'matched'));
});

test('unmatched or ambiguous OCR rows stay unresolved and are not dropped from evidence', () => {
  const invoice = extractInvoice('Unknown product 3 10.00 30.00\nTOTAL INR 30.00', DEMO_CATALOG);
  assert.equal(invoice.lines.length, 1);
  assert.equal(invoice.lines[0].catalogueItemId, null);
  assert.equal(invoice.lines[0].confidence, 'review');
  assert.equal(invoice.lines[0].evidence, 'Unknown product 3 10.00 30.00');
});

test('a longer exact invoice name wins over a shorter overlapping catalogue name for the same pack', () => {
  const catalogue: CatalogItem[] = [
    ...DEMO_CATALOG,
    { id: 'shop-maggi-70g', name: 'Maggi Masala', packSize: '70 g', unit: 'packet', aliases: [] },
  ];
  const invoice = extractInvoice('Maggi Masala Noodles 70 g 12 50.00 600.00', catalogue);
  assert.equal(invoice.lines[0].catalogueItemId, 'maggi-70g');
  const compactPack = extractInvoice('Maggi Masala Noodles 70g 12 50.00 600.00', catalogue);
  assert.equal(compactPack.lines[0].catalogueItemId, 'maggi-70g');
});

test('spatial OCR blocks from aligned invoice columns are reassembled into reviewable rows', () => {
  const blocks = [
    { text: '12', x: 0.64, y: 0.52, width: 0.03, height: 0.018 },
    { text: 'Maggi Masala Noodles 70 g', x: 0.08, y: 0.519, width: 0.35, height: 0.02 },
    { text: '600.00', x: 0.86, y: 0.521, width: 0.08, height: 0.018 },
    { text: '50.00', x: 0.72, y: 0.522, width: 0.06, height: 0.019 },
    { text: 'Surf Excel Detergent 500 g', x: 0.08, y: 0.45, width: 0.36, height: 0.02 },
    { text: '6', x: 0.64, y: 0.451, width: 0.01, height: 0.018 },
    { text: '240.00', x: 0.86, y: 0.45, width: 0.08, height: 0.018 },
    { text: '40.00', x: 0.72, y: 0.45, width: 0.06, height: 0.018 },
  ];
  const text = joinInvoiceOCRBlocks(blocks);
  assert.match(text, /Maggi Masala Noodles 70 g 12 50\.00 600\.00/u);
  assert.match(text, /Surf Excel Detergent 500 g 6 40\.00 240\.00/u);
  const invoice = extractInvoice(text, DEMO_CATALOG);
  assert.deepEqual(invoice.lines.map((line) => [line.catalogueItemId, line.billedQuantity]), [
    ['maggi-70g', 12],
    ['surf-excel-500g', 6],
  ]);
});
