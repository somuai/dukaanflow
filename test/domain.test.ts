import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AMOUNT_PAID_ISSUE,
  DEMO_CATALOG,
  DEMO_TRANSCRIPT,
  PAYMENT_METHOD_ISSUE,
  RECEIPT_TOTAL_ISSUE,
  parseReceipt,
  parseShopEventItems,
  parseRupees,
  toReceiptInput,
  validateReceiptDraft,
} from '../src/domain.ts';

test('mixed-note supplier and customer clauses produce editable catalog item quantity proposals', () => {
  const catalog = [
    { id: 'maggi-kg', name: 'Maggi', packSize: '1 kg', unit: 'kg' as const, aliases: ['maggi', 'मैगी'] },
    { id: 'milk-packet', name: 'Milk', packSize: '500 ml', unit: 'packet' as const, aliases: ['milk', 'doodh', 'दूध'] },
    { id: 'bread', name: 'Bread', packSize: 'loaf', unit: 'piece' as const, aliases: ['bread'] },
  ];
  const supplierLines = parseShopEventItems('Sharma ji ne aaj 10 kg maggi bheje hain aur 4 cartons doodh', catalog);
  assert.equal(supplierLines.find((line) => line.catalogItemId === 'maggi-kg')?.quantity, 10);
  const cartonMilk = supplierLines.find((line) => line.label.toLocaleLowerCase().includes('carton'));
  assert.ok(cartonMilk, 'keep the milk carton line visible for correction');
  assert.equal(cartonMilk?.quantity, 4, 'the spoken carton count should be extracted');
  assert.equal(cartonMilk?.unit, 'box', 'carton is a box receiving unit, not an implicit packet count');

  const customerLines = parseShopEventItems('Tinku ji ne aaj mere se 2 packets maggi kharide hain aur 2 packets doodh', [
    { id: 'maggi-packet', name: 'Maggi', packSize: '70 g', unit: 'packet' as const, aliases: ['maggi', 'मैगी'] },
    ...catalog.slice(1),
  ]);
  assert.equal(customerLines.find((line) => line.catalogItemId === 'maggi-packet')?.quantity, 2);
  assert.equal(customerLines.find((line) => line.catalogItemId === 'milk-packet')?.quantity, 2);
});

test('the demo resolves Surf and requires a Maggi pack selection', () => {
  const draft = parseReceipt(DEMO_TRANSCRIPT);
  assert.equal(draft.supplier, 'Sharma');
  assert.equal(draft.lines[0].catalogItemId, null);
  assert.deepEqual(draft.lines[0].candidateIds, ['maggi-70g', 'maggi-280g']);
  assert.equal(draft.lines[0].quantity, 12);
  assert.equal(draft.lines[1].catalogItemId, 'surf-excel-500g');
  assert.equal(draft.lines[1].quantity, 6);
  assert.equal(draft.receiptTotalPaise, 84_000);
  assert.equal(draft.amountPaidPaise, 50_000);
  assert.equal(draft.paymentMethod, 'cash');
  assert.equal(toReceiptInput(draft), null);

  draft.lines[0].catalogItemId = 'maggi-70g';
  assert.deepEqual(toReceiptInput(draft)?.lines[0], {
    catalogItemId: 'maggi-70g', name: 'Maggi Masala Noodles', packSize: '70 g', quantity: 12, unit: 'packet',
  });
});

test('Devanagari numbers and Hindi aliases preserve the stated count and payment amount', () => {
  const draft = parseReceipt('आज शर्मा से मैगी ७० ग्राम के बारह पैकेट और सर्फ एक्सेल ५०० ग्राम के छह पैकेट आए। ८४० रुपये नकद दिए।');
  assert.deepEqual(draft.lines.map((line) => [line.catalogItemId, line.quantity]), [['maggi-70g', 12], ['surf-excel-500g', 6]]);
  assert.equal(draft.supplier, 'शर्मा');
  assert.equal(draft.amountPaidPaise, 84_000);
  assert.equal(draft.receiptTotalPaise, null);
});

test('English quantities and currency punctuation survive clause splitting', () => {
  const draft = parseReceipt('Today received twelve packets of Maggi 70g from Sharma. Bill eight hundred and forty. Paid Rs. 500.05 by UPI.');
  assert.equal(draft.supplier, 'Sharma');
  assert.equal(draft.lines[0].catalogItemId, 'maggi-70g');
  assert.equal(draft.lines[0].quantity, 12);
  assert.equal(draft.receiptTotalPaise, 84_000);
  assert.equal(draft.amountPaidPaise, 50_005);
  assert.equal(draft.paymentMethod, 'upi');
  assert.deepEqual(validateReceiptDraft(draft), []);
});

test('uncertain quantities, wrong units and unmatched text require correction', () => {
  for (const quantity of ['12 ya 13', '12 or 13', '12-13', '1.5', '12 nahi 10', '12 13', '0', '1000001']) {
    const draft = parseReceipt(`Maggi 70g ke ${quantity} packet aaye.`);
    assert.equal(draft.lines[0].quantity, null, quantity);
    assert.equal(toReceiptInput(draft), null);
  }
  const wrongUnit = parseReceipt('Bisleri 1 l ke 6 packet aaye.');
  assert.equal(wrongUnit.lines[0].catalogItemId, 'bisleri-1l');
  assert.equal(toReceiptInput(wrongUnit), null);

  const unknownLine = parseReceipt('Maggi 70g ke 12 packet aur kuch aur bhi aaya.');
  assert.ok(unknownLine.lines.length > 1);
  assert.equal(toReceiptInput(unknownLine), null);

  const uncertainPack = parseReceipt('Maggi 70 g ya 280 g ke 12 packet aaye.');
  assert.equal(uncertainPack.lines[0].catalogItemId, null);
  assert.deepEqual(uncertainPack.lines[0].candidateIds, ['maggi-70g', 'maggi-280g']);
});

test('supplier delivery clauses segment the supplier and products but cartons cannot become stock', () => {
  const draft = parseReceipt('Sharma ji delivered 12 cartons of Maggi and 4 cartons of milk today.');
  assert.equal(draft.supplier, 'Sharma ji');
  assert.equal(draft.lines.length, 2, 'the two products should remain separate draft lines');
  assert.deepEqual(draft.lines.map((line) => [line.quantity, line.unit]), [[12, 'box'], [4, 'box']]);
  assert.equal(toReceiptInput(draft), null, 'a carton count cannot select a packet SKU or an unknown product');
});

test('a Hindi supplier dispatch keeps the supplier, product clauses, and spoken carton quantities', () => {
  const draft = parseReceipt('Sharma ji ne aaj 12 carton Maggi aur 4 carton doodh bheje.');
  assert.equal(draft.supplier, 'Sharma ji');
  assert.equal(draft.lines.length, 2);
  assert.deepEqual(draft.lines.map((line) => line.quantity), [12, 4]);
  assert.deepEqual(draft.lines.map((line) => line.unit), ['box', 'box']);
  assert.equal(draft.lines[0].candidateIds.length, 2, 'ambiguous Maggi packs still require selection');
  assert.equal(toReceiptInput(draft), null);
});

test('a mixed-language Hindi dispatch ending in diye keeps carton counts but requires compatible catalog units', () => {
  const catalog = [
    ...DEMO_CATALOG,
    { id: 'milk-500ml', name: 'Milk', packSize: '500 ml', unit: 'bottle' as const, aliases: ['दूध', 'doodh', 'milk 500 ml'] },
  ];
  const draft = parseReceipt('Rajesh supplier ne mujhe 12 carton Maggi aur 4 carton doodh diye.', catalog);

  assert.equal(draft.supplier, 'Rajesh supplier');
  assert.equal(draft.lines.length, 2, 'Maggi and milk must remain separate delivery lines');
  assert.deepEqual(draft.lines.map((line) => line.quantity), [12, 4], 'both spoken carton counts should be extracted');
  assert.deepEqual(draft.lines.map((line) => line.unit), ['box', 'box'], 'carton is represented as the box stock unit');
  assert.deepEqual(draft.lines[0].candidateIds, ['maggi-70g', 'maggi-280g']);
  assert.deepEqual(draft.lines[1].candidateIds, ['milk-500ml']);
  assert.equal(toReceiptInput(draft), null);
});

test('the screenshot Hinglish receipt resolves party, quantities, and units when exact shop SKUs exist', () => {
  const catalog = [
    { id: 'maggi-kg', name: 'Maggi', packSize: '1 kg', unit: 'kg' as const, aliases: ['maggi', 'मैगी'] },
    { id: 'milk-carton', name: 'Milk', packSize: 'carton · 12 x 500 ml', unit: 'box' as const, aliases: ['milk', 'doodh', 'दूध'], packageContent: '12 x 500 ml' },
  ];
  const draft = parseReceipt('Sharma जी ने आज 10 kg maggi भेजे हैं और 4 cartons दूध', catalog);

  assert.equal(draft.supplier, 'Sharma जी');
  assert.deepEqual(draft.lines.map((line) => [line.catalogItemId, line.quantity, line.unit]), [
    ['maggi-kg', 10, 'kg'],
    ['milk-carton', 4, 'box'],
  ]);
  assert.ok(toReceiptInput(draft, catalog), 'a fully matched receipt should not need per-line product, quantity, or unit correction');
});

test('the complete two-event voice note cannot be confirmed as one supplier receipt', () => {
  const transcript = 'Rajesh supplier ne mujhe 12 carton Maggi aur 4 carton doodh diye; Raju ne ₹100 ka udhaar liya. For that he will say that he has ₹40 withdrawn. दो दूध और दो bread and पटल लिया है, Sunday तक लाता देगा वो.';
  const draft = parseReceipt(transcript);
  assert.equal(toReceiptInput(draft), null, 'a mixed note with unresolved customer terms and goods must not post supplier stock');
});

test('a customer credit clause cannot be saved as supplier stock when the receipt items all match', () => {
  const catalog = [
    { id: 'maggi-kg', name: 'Maggi', packSize: '1 kg', unit: 'kg' as const, aliases: ['maggi', 'मैगी'] },
    { id: 'milk-carton', name: 'Milk', packSize: 'carton · 12 x 500 ml', unit: 'box' as const, aliases: ['milk', 'doodh', 'दूध'] },
  ];
  const transcript = 'Sharma जी ने आज 10 kg maggi भेजे हैं और 4 cartons दूध; Raju ने ₹100 का उधार लिया।';

  assert.equal(toReceiptInput(parseReceipt(transcript, catalog)), null,
    'valid supplier lines must not make an appended customer credit event saveable as a receipt');
});

test('an itemized customer purchase cannot be saved as supplier stock when catalog units match', () => {
  const catalog = [
    { id: 'maggi-kg', name: 'Maggi', packSize: '1 kg', unit: 'kg' as const, aliases: ['maggi', 'मैगी'] },
    { id: 'milk-carton', name: 'Milk', packSize: 'carton · 12 x 500 ml', unit: 'box' as const, aliases: ['milk', 'doodh', 'दूध'] },
    { id: 'bread-piece', name: 'Bread', packSize: 'loaf', unit: 'piece' as const, aliases: ['bread'] },
  ];
  const transcript = 'Sharma जी ने 10 kg maggi भेजे और 4 cartons दूध; Tinku जी ने 2 pieces bread लिए।';

  assert.equal(toReceiptInput(parseReceipt(transcript, catalog)), null,
    'a recognized itemized customer sale must not be reinterpreted as a supplier receipt');
});

test('stated but ambiguous money needs a correction or explicit unknown decision', () => {
  const draft = parseReceipt('Maggi 70g ke 12 packet aaye. Bill 840 ya 800 ka tha. 500 cash ya UPI diya.');
  assert.deepEqual(draft.issues, [RECEIPT_TOTAL_ISSUE, AMOUNT_PAID_ISSUE, PAYMENT_METHOD_ISSUE]);
  assert.deepEqual(validateReceiptDraft(draft), draft.issues);
  assert.equal(toReceiptInput(draft), null);

  draft.receiptTotalPaise = 84_000;
  draft.amountPaidPaise = 50_000;
  draft.issues = draft.issues.filter((issue) => issue !== PAYMENT_METHOD_ISSUE);
  assert.deepEqual(validateReceiptDraft(draft), []);
  assert.equal(toReceiptInput(draft)?.paymentMethod, null);
});

test('money is bounded and uses integer paise', () => {
  assert.equal(parseRupees('₹१,२३,४५६.७०'), 12_345_670);
  assert.equal(parseRupees('Rs. 7.5'), 750);
  for (const amount of ['-5', '1.234', '2,70', '1000000000.01', '']) assert.equal(parseRupees(amount), null, amount);
});
