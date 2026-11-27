import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeHomeNote, classifyHomeCapture, resolveHomeCreditCapture, resolveRetailPurchase, toHomeNoteBatchInput } from '../src/home-capture.ts';
import type { CatalogItem } from '../src/domain.ts';
import type { Customer, SupplierProfile } from '../src/store.ts';

const customers: Customer[] = [
  { id: 'raj', name: 'Raj Kumar', aliases: ['Raj'], createdAt: '2026-11-01T00:00:00Z', balancePaise: 0, openPromiseCount: 0 },
];
const suppliers: SupplierProfile[] = [
  { id: 'sharma', name: 'Sharma Distributors', aliases: ['Sharma ji'], createdAt: '2026-11-01T00:00:00Z', balancePaise: 0, deliveryCount: 0, paymentCount: 0 },
];

test('everyday Hindi separates Raj and Raju, resolves a supplier pronoun, and records goods against explicit credit', () => {
  const catalog: CatalogItem[] = [
    { id: 'atta', name: 'Atta', packSize: 'Loose', unit: 'kg', aliases: ['आटा'] },
    { id: 'milk', name: 'Milk', packSize: 'Bulk', unit: 'kg', aliases: ['दूध'] },
    { id: 'bread', name: 'Bread', packSize: 'Loaf', unit: 'piece', aliases: ['ब्रेड'] },
    { id: 'egg', name: 'Egg', packSize: 'Single', unit: 'piece', aliases: ['अंडा', 'अंडे'] },
    { id: 'butter', name: 'Butter', packSize: '100 g pack', unit: 'packet', aliases: ['मक्खन'] },
  ];
  const parties = {
    suppliers: [{ ...suppliers[0], id: 'raj-supplier', name: 'राज', aliases: ['राज'] }],
    customers: [{ ...customers[0], id: 'raju', name: 'राजू', aliases: ['राजू'] }],
  };
  const note = 'राज मेरे supplier है माल का। आज उसने मेरे को 10 kg आटा और 5 kg दूध भेजा है। राजू ने मेरे से ₹100 उधार लिया है और उसके बदले 4 bread, 2 अंडा, 1 bread और 1 butter लिया है।';
  const analysis = analyzeHomeNote(note, parties.customers, parties.suppliers, '2026-11-26', catalog);
  assert.equal(analysis.transcript, note);
  assert.deepEqual(analysis.unresolvedSegments, []);
  const [delivery, purchase] = analysis.events;
  assert.equal(delivery.kind, 'supplier');
  assert.equal(delivery.supplierId, 'raj-supplier');
  assert.deepEqual(delivery.lines?.map(({ catalogueItemId, quantity, unit }) => [catalogueItemId, quantity, unit]), [['atta', 10, 'kg'], ['milk', 5, 'kg']]);
  assert.equal(purchase.kind, 'customer');
  assert.equal(purchase.customerId, 'raju');
  assert.equal(purchase.credit?.amountPaise, 10_000);
  assert.deepEqual(purchase.credit?.promise, { amountPaise: 10_000, dueDate: '2026-12-03', dateSource: 'estimated' });
  assert.deepEqual(purchase.lines, [
    { catalogueItemId: 'bread', quantity: 5 },
    { catalogueItemId: 'egg', quantity: 2 },
    { catalogueItemId: 'butter', quantity: 1 },
  ]);

  const withPromise = note.replace('1 butter लिया है।', '1 butter लिया है, रविवार तक चुका देगा।');
  const promisedBatch = toHomeNoteBatchInput(analyzeHomeNote(withPromise, parties.customers, parties.suppliers, '2026-11-26', catalog));
  assert.deepEqual(promisedBatch?.credit?.promise, { amountPaise: 10_000, dueDate: '2026-11-29', note: null });
  assert.equal(toHomeNoteBatchInput(analyzeHomeNote(withPromise.replace('रविवार', 'कल'), parties.customers, parties.suppliers, '2026-11-26', catalog))?.credit?.promise?.dueDate, '2026-11-27');
  const dateOnly = withPromise.replace('रविवार तक चुका देगा', 'रविवार तक');
  assert.equal(toHomeNoteBatchInput(analyzeHomeNote(dateOnly, parties.customers, parties.suppliers, '2026-11-26', catalog))?.credit?.promise?.dueDate, '2026-11-29');
  const inFourDays = withPromise.replace('रविवार तक', '4 दिन में');
  assert.equal(toHomeNoteBatchInput(analyzeHomeNote(inFourDays, parties.customers, parties.suppliers, '2026-11-26', catalog))?.credit?.promise?.dueDate, '2026-11-30');
  assert.equal(toHomeNoteBatchInput(analyzeHomeNote(withPromise.replace('चुका देगा', '₹40 चुका देगा'), parties.customers, parties.suppliers, '2026-11-26', catalog)), null);

  const ambiguousBread = [...catalog, { ...catalog[2], id: 'bread-large', packSize: 'Large loaf' }];
  assert.equal(toHomeNoteBatchInput(analyzeHomeNote(note, parties.customers, parties.suppliers, '2026-11-26', ambiguousBread)), null);
  const unknownSupplier = analyzeHomeNote(note, parties.customers, [], '2026-11-26', catalog);
  assert.equal(toHomeNoteBatchInput(unknownSupplier), null);
  assert.deepEqual(unknownSupplier.clarification, { kind: 'supplier', label: 'राज', ambiguous: false });
  const milkOnlyInPackets = catalog.map((item) => item.id === 'milk' ? { ...item, unit: 'packet' as const } : item);
  const wrongMilkUnit = analyzeHomeNote(note, parties.customers, parties.suppliers, '2026-11-26', milkOnlyInPackets);
  assert.equal(toHomeNoteBatchInput(wrongMilkUnit), null);
  assert.deepEqual(wrongMilkUnit.clarification, { kind: 'catalog', label: '5 kg दूध', ambiguous: false });
  assert.equal(toHomeNoteBatchInput(analyzeHomeNote(note.replace('1 butter', '₹40 withdrawn और 1 butter'), parties.customers, parties.suppliers, '2026-11-26', catalog)), null);
  const spokenCounts = note.replace('4 bread, 2 अंडा, 1 bread', '४ bread, दो अंडे, एक ब्रेड');
  assert.deepEqual(
    toHomeNoteBatchInput(analyzeHomeNote(spokenCounts, parties.customers, parties.suppliers, '2026-11-26', catalog))?.sale?.lines,
    purchase.lines,
  );
  const unpunctuated = note.replace(/[।,]/gu, '');
  assert.deepEqual(
    toHomeNoteBatchInput(analyzeHomeNote(unpunctuated, parties.customers, parties.suppliers, '2026-11-26', catalog))?.sale?.lines,
    purchase.lines,
  );
  const compoundProduct = { ...catalog[2], id: 'combo', name: 'Bread 2 अंडा', aliases: [] };
  assert.equal(toHomeNoteBatchInput(analyzeHomeNote(unpunctuated, parties.customers, parties.suppliers, '2026-11-26', [...catalog, compoundProduct])), null,
    'when omitted punctuation could mean one named SKU or two separate products, neither interpretation is committed');
  const romanNote = 'Raj mera supplier hai maal ka. Aaj usne mere ko 10 kg atta aur 5 kg milk bheja hai. Raju ne mere se ₹100 udhaar liya hai aur uske badle 4 bread, 2 egg, 1 bread aur 1 butter liya hai.';
  const roman = analyzeHomeNote(romanNote,
    [{ ...parties.customers[0], aliases: ['Raju'] }], [{ ...parties.suppliers[0], aliases: ['Raj'] }], '2026-11-26', catalog);
  assert.deepEqual(toHomeNoteBatchInput(roman)?.sale?.lines, purchase.lines);
  assert.deepEqual(toHomeNoteBatchInput(roman)?.receipt?.lines.map(({ catalogItemId, quantity }) => [catalogItemId, quantity]), [['atta', 10], ['milk', 5]]);
  for (const amount of ['सौ रुपये', '१०० रुपए', '₹१००']) {
    const voice = analyzeHomeNote(note.replace('₹100', amount), parties.customers, parties.suppliers, '2026-11-26', catalog);
    assert.equal(toHomeNoteBatchInput(voice)?.credit?.event.amountPaise, 10_000, amount);
  }
  for (const changed of [
    note.replace('भेजा है', 'नहीं भेजा है'),
    note.replace('उधार लिया है', 'उधार नहीं लिया है'),
    note.replace('₹100', '₹100 या ₹40'),
  ]) {
    assert.equal(toHomeNoteBatchInput(analyzeHomeNote(changed, parties.customers, parties.suppliers, '2026-11-26', catalog)), null, changed);
  }
});

test('an explicitly stated due day stays fixed without a repayment verb', () => {
  const capture = resolveHomeCreditCapture('Raj ne ₹100 udhaar liya, Sunday tak.', customers, suppliers, [], '2026-11-26');
  assert.deepEqual(capture?.promise, { amountPaise: 10_000, dueDate: '2026-11-29' });
  const todayAndDue = resolveHomeCreditCapture('Raj ne aaj ₹100 udhaar liya, Sunday tak.', customers, suppliers, [], '2026-11-26');
  assert.equal(todayAndDue?.promise?.dueDate, '2026-11-29');
});

test('undated credit creates an estimated follow-up seven days later', () => {
  const capture = resolveHomeCreditCapture('Raj ne ₹100 udhaar liya.', customers, suppliers, [], '2026-11-26');
  assert.deepEqual(capture?.promise, { amountPaise: 10_000, dueDate: '2026-12-03', dateSource: 'estimated' });
  const noDatePromise = resolveHomeCreditCapture('Raj borrowed ₹100 and will repay.', customers, suppliers, [], '2026-11-26');
  assert.deepEqual(noDatePromise?.promise, { amountPaise: 10_000, dueDate: '2026-12-03', dateSource: 'estimated' });
});

test('one Home entry classifies a Hindi/Hinglish credit event as a customer event', () => {
  assert.equal(classifyHomeCapture('Raj ne ₹40 ka samaan udhaar liya, 4 din mein dega.', customers, suppliers, '2026-11-24'), 'customer');
});

test('a customer repayment is not mistaken for a supplier delivery because Hindi uses diye', () => {
  assert.equal(classifyHomeCapture('Raj ne ₹200 UPI de diye.', customers, suppliers, '2026-11-24'), 'customer');
});

test('English loan wording is categorized as a customer-credit event', () => {
  assert.equal(classifyHomeCapture('Raj borrowed ₹100 and will repay it in four days.', customers, suppliers, '2026-11-24'), 'customer');
});

test('a single unambiguous English credit event and promise can be recorded from Home without field-by-field review', () => {
  const capture = resolveHomeCreditCapture(
    'Raj borrowed ₹100 and will repay it in four days.', customers, suppliers, [], '2026-11-24',
  );
  assert.deepEqual(capture, {
    customerId: 'raj', customerName: 'Raj Kumar', kind: 'credit_sale', amountPaise: 10_000,
    paymentMethod: null, sourceText: 'Raj borrowed ₹100 and will repay it in four days.',
    promise: { amountPaise: 10_000, dueDate: '2026-11-28' },
  });
});

test('a single Hinglish udhaar amount and relative promise can be resolved without opening customer review', () => {
  const capture = resolveHomeCreditCapture(
    'Raj ne ₹40 ka samaan udhaar liya, 4 din mein dega.', customers, suppliers, [], '2026-11-24',
  );
  assert.deepEqual(capture, {
    customerId: 'raj', customerName: 'Raj Kumar', kind: 'credit_sale', amountPaise: 4_000,
    paymentMethod: null, sourceText: 'Raj ne ₹40 ka samaan udhaar liya, 4 din mein dega.',
    promise: { amountPaise: 4_000, dueDate: '2026-11-28' },
  });
});

test('a single Hindi UPI repayment is categorized as repayment rather than supplier delivery', () => {
  const capture = resolveHomeCreditCapture('Raj ne ₹40 UPI de diye.', customers, suppliers, [], '2026-11-24');
  assert.deepEqual(capture, {
    customerId: 'raj', customerName: 'Raj Kumar', kind: 'repayment_received', amountPaise: 4_000,
    paymentMethod: 'upi', sourceText: 'Raj ne ₹40 UPI de diye.', promise: null,
  });
});

test('a repayment note cannot create a new promise-to-pay event', () => {
  assert.equal(resolveHomeCreditCapture(
    'Raj ne ₹40 UPI de diye aur 4 din mein dega.', customers, suppliers, [], '2026-11-24',
  ), null, 'a promise cannot be attached to a repayment event without a new credit sale');
});

test('Home credit auto-categorization declines mixed events and product itemization it cannot represent', () => {
  const catalog: CatalogItem[] = [
    { id: 'milk', name: 'Milk', packSize: '500 ml', unit: 'packet', aliases: ['milk', 'doodh'] },
  ];
  assert.equal(resolveHomeCreditCapture(
    'Sharma sent 4 cartons of milk; Raj borrowed ₹100.', customers, suppliers, catalog, '2026-11-24',
  ), null);
  assert.equal(resolveHomeCreditCapture(
    'Raj borrowed ₹100 and took 2 packets of milk.', customers, suppliers, catalog, '2026-11-24',
  ), null);
  assert.equal(resolveHomeCreditCapture(
    'Raj ne ₹100 udhaar liya, ₹40 withdrawn, Sunday tak dega.', customers, suppliers, [], '2026-11-25',
  ), null, 'two amounts and an unclear partial-payment relationship must not alter the balance');
  assert.equal(resolveHomeCreditCapture(
    'Raj loaned ₹100 to a friend.', customers, suppliers, [], '2026-11-25',
  ), null, 'lender/borrower direction is not inferred from the word loan alone');
});

test('one Home entry routes a supplier dispatch to delivery review', () => {
  assert.equal(classifyHomeCapture('Sharma ji ne aaj 12 carton Maggi aur 4 carton doodh bheje.', customers, suppliers, '2026-11-24'), 'supplier');
});

test('an unconfigured supplier name can route when the phrase clearly describes counted delivered stock', () => {
  assert.equal(classifyHomeCapture('Sharma sent 12 Maggi cartons.', customers, suppliers, '2026-11-24'), 'supplier');
});

test('a supplier delivery with a payment mention stays on the supplier path', () => {
  assert.equal(classifyHomeCapture('Sharma ji delivered 12 Maggi cartons; 500 cash de diye.', customers, suppliers, '2026-11-24'), 'supplier');
});

test('mixed customer and supplier events require the owner to choose', () => {
  assert.equal(classifyHomeCapture('Sharma ji sent 12 Maggi cartons; Raj took ₹40 udhaar.', customers, suppliers, '2026-11-24'), 'choose');
});

test('a realistic Hindi and code-switched mixed note is never routed into only one ledger', () => {
  const shopCustomers = [
    ...customers,
    { id: 'raju', name: 'Raju Kumar', aliases: ['Raju'], createdAt: '2026-11-01T00:00:00Z', balancePaise: 0, openPromiseCount: 0 },
  ];
  const shopSuppliers = [
    ...suppliers,
    { id: 'rajesh', name: 'Rajesh Traders', aliases: ['Rajesh', 'Rajesh supplier'], createdAt: '2026-11-01T00:00:00Z', balancePaise: 0, deliveryCount: 0, paymentCount: 0 },
  ];
  const transcript = 'Rajesh supplier ne mujhe 12 carton Maggi aur 4 carton doodh diye; Raju ne ₹100 ka udhaar liya. For that he will say that he has ₹40 withdrawn. दो दूध और दो bread and पटल लिया है, Sunday तक लाता देगा वो.';

  assert.equal(
    classifyHomeCapture(transcript, shopCustomers, shopSuppliers, '2026-11-25'),
    'choose',
    'a combined or uncertain note must not be routed as only a customer or supplier event',
  );
});

test('an explicit semicolon lets transcript analysis produce separate supplier and customer clauses', () => {
  const shopCustomers = [
    ...customers,
    { id: 'raju', name: 'Raju Kumar', aliases: ['Raju'], createdAt: '2026-11-01T00:00:00Z', balancePaise: 0, openPromiseCount: 0 },
  ];
  const shopSuppliers = [
    ...suppliers,
    { id: 'rajesh', name: 'Rajesh Traders', aliases: ['Rajesh', 'Rajesh supplier'], createdAt: '2026-11-01T00:00:00Z', balancePaise: 0, deliveryCount: 0, paymentCount: 0 },
  ];
  const transcript = 'Rajesh supplier ne mujhe 12 carton Maggi aur 4 carton doodh diye; Raju ne ₹100 ka udhaar liya. For that he will say that he has ₹40 withdrawn. दो दूध और दो bread and पटल लिया है, Sunday तक लाता देगा वो.';
  const analysis = analyzeHomeNote(transcript, shopCustomers, shopSuppliers, '2026-11-25');

  assert.equal(analysis.transcript, transcript, 'keep the complete original Wispr text as review evidence');
  assert.deepEqual(analysis.events, [
    { kind: 'supplier', sourceText: 'Rajesh supplier ne mujhe 12 carton Maggi aur 4 carton doodh diye' },
    { kind: 'customer', sourceText: 'Raju ne ₹100 ka udhaar liya. For that he will say that he has ₹40 withdrawn. दो दूध और दो bread and पटल लिया है, Sunday तक लाता देगा वो.' },
  ]);
  assert.deepEqual(analysis.unresolvedSegments, [], 'without a catalog, this compatibility path only classifies the two clauses');
});

test('known supplier and customer aliases create separate clauses without punctuation', () => {
  const customersWithRaju = [...customers, { id: 'raju', name: 'Raju Kumar', aliases: ['Raju'], createdAt: '2026-11-01T00:00:00Z', balancePaise: 0, openPromiseCount: 0 }];
  const suppliersWithRajesh = [...suppliers, { id: 'rajesh', name: 'Rajesh Traders', aliases: ['Rajesh supplier'], createdAt: '2026-11-01T00:00:00Z', balancePaise: 0, deliveryCount: 0, paymentCount: 0 }];
  const transcript = 'Rajesh supplier ne mujhe Maggi diye aur Raju ne udhaar liya';
  const analysis = analyzeHomeNote(transcript, customersWithRaju, suppliersWithRajesh, '2026-11-25');
  assert.equal(analysis.transcript, transcript);
  assert.deepEqual(analysis.events, [
    { kind: 'supplier', sourceText: 'Rajesh supplier ne mujhe Maggi diye' },
    { kind: 'customer', sourceText: 'Raju ne udhaar liya' },
  ]);
  assert.deepEqual(analysis.unresolvedSegments, []);
});

test('known supplier-to-customer names split a punctuation-free Hinglish delivery and purchase note', () => {
  const shopCustomers = [...customers, { id: 'tinku', name: 'Tinku ji', aliases: ['Tinku'], createdAt: '2026-11-01T00:00:00Z', balancePaise: 0, openPromiseCount: 0 }];
  const analysis = analyzeHomeNote(
    'Sharma ji ne aaj 10 kg maggi bheje hain aur 4 cartons doodh aur Tinku ji ne aaj mere se 2 packets maggi kharide hain aur 2 packets doodh',
    shopCustomers,
    suppliers,
    '2026-11-25',
  );
  assert.deepEqual(analysis.events, [
    { kind: 'supplier', sourceText: 'Sharma ji ne aaj 10 kg maggi bheje hain aur 4 cartons doodh' },
    { kind: 'customer', sourceText: 'Tinku ji ne aaj mere se 2 packets maggi kharide hain aur 2 packets doodh' },
  ]);
  assert.deepEqual(analysis.unresolvedSegments, []);
});

test('one mixed Hinglish note with code-switched ji honorifics categorizes supplier stock and customer purchase lines', () => {
  const shopCustomers = [...customers, { id: 'tinku', name: 'Tinku ji', aliases: ['Tinku ji'], createdAt: '2026-11-01T00:00:00Z', balancePaise: 0, openPromiseCount: 0 }];
  const catalog: CatalogItem[] = [
    { id: 'maggi-kg', name: 'Maggi', packSize: '1 kg', unit: 'kg', aliases: ['maggi'] },
    { id: 'maggi-packet', name: 'Maggi', packSize: '70 g', unit: 'packet', aliases: ['maggi'] },
    { id: 'milk-carton', name: 'Milk', packSize: 'carton · 12 x 500 ml', unit: 'box', aliases: ['doodh', 'milk'], packageContent: '12 x 500 ml' },
    { id: 'milk-packet', name: 'Milk', packSize: '500 ml', unit: 'packet', aliases: ['doodh', 'milk'] },
  ];
  const transcript = 'Sharma जी ने आज 10 kg maggi भेजे हैं और 4 cartons दूध और Tinku जी ने आज मेरे से 2 packets maggi खरीदे हैं और 2 packets दूध';
  const analysis = analyzeHomeNote(transcript, shopCustomers, suppliers, '2026-11-25', catalog);

  assert.deepEqual(analysis.events, [
    {
      kind: 'supplier', supplierId: 'sharma', supplierName: 'Sharma Distributors',
      sourceText: 'Sharma जी ने आज 10 kg maggi भेजे हैं और 4 cartons दूध',
      lines: [
        { catalogueItemId: 'maggi-kg', name: 'Maggi', packSize: '1 kg', unit: 'kg', quantity: 10 },
        { catalogueItemId: 'milk-packet', name: 'Milk', packSize: '500 ml', unit: 'packet', quantity: 48 },
      ],
    },
    {
      kind: 'customer', customerId: 'tinku', customerName: 'Tinku ji',
      sourceText: 'Tinku जी ने आज मेरे से 2 packets maggi खरीदे हैं और 2 packets दूध',
      lines: [
        { catalogueItemId: 'maggi-packet', quantity: 2 },
        { catalogueItemId: 'milk-packet', quantity: 2 },
      ],
    },
  ]);
  assert.deepEqual(analysis.unresolvedSegments, []);
});

test('one mixed note resolves a supplier receipt and a separate customer credit promise without itemizing unpriced goods', () => {
  const shopCustomers = [...customers, { id: 'raju', name: 'Raju ji', aliases: ['Raju'], createdAt: '2026-11-01T00:00:00Z', balancePaise: 0, openPromiseCount: 0 }];
  const catalog: CatalogItem[] = [
    { id: 'maggi-packet', name: 'Maggi', packSize: '70 g', unit: 'packet', aliases: ['maggi'] },
  ];
  const transcript = 'Sharma ji ne 12 packets Maggi bheje aur Raju ji ne ₹100 udhaar liya, 4 din mein dega.';
  const analysis = analyzeHomeNote(transcript, shopCustomers, suppliers, '2026-11-26', catalog);

  assert.deepEqual(analysis.unresolvedSegments, []);
  assert.deepEqual(analysis.events, [
    {
      kind: 'supplier', supplierId: 'sharma', supplierName: 'Sharma Distributors',
      sourceText: 'Sharma ji ne 12 packets Maggi bheje',
      lines: [{ catalogueItemId: 'maggi-packet', name: 'Maggi', packSize: '70 g', unit: 'packet', quantity: 12 }],
    },
    {
      kind: 'customer', customerId: 'raju', customerName: 'Raju ji',
      sourceText: 'Raju ji ne ₹100 udhaar liya, 4 din mein dega.',
      credit: {
        customerId: 'raju', customerName: 'Raju ji', kind: 'credit_sale', amountPaise: 10_000,
        paymentMethod: null, sourceText: 'Raju ji ne ₹100 udhaar liya, 4 din mein dega.',
        promise: { amountPaise: 10_000, dueDate: '2026-11-30' },
      },
    },
  ]);
});

test('mixed credit, repayment, promise, invoice, and damage details cannot be silently dropped by the auto-save path', () => {
  const shopCustomers = [...customers, { id: 'raju', name: 'Raju', aliases: ['Raju'], createdAt: '2026-11-01T00:00:00Z', balancePaise: 0, openPromiseCount: 0 }];
  const catalog: CatalogItem[] = [
    { id: 'maggi-packet', name: 'Maggi', packSize: '70 g', unit: 'packet', aliases: ['maggi'] },
    { id: 'milk-packet', name: 'Milk', packSize: '500 ml', unit: 'packet', aliases: ['doodh', 'milk'] },
  ];
  const transcript = 'Sharma ji supplier ne mujhe 12 packets Maggi aur 4 packets doodh diye; Raju ne ₹100 ka udhaar liya, ₹40 withdrawn, do doodh aur do bread butter liya, 4 din mein chuka dega.';
  const analysis = analyzeHomeNote(transcript, shopCustomers, suppliers, '2026-11-25', catalog);

  assert.equal(analysis.events.filter(({ kind }) => kind === 'supplier').length, 1);
  assert.equal(analysis.events.filter(({ kind }) => kind === 'customer').length, 1);
  assert.ok(analysis.unresolvedSegments.length > 0,
    'the mixed note stays unsaved when the current auto-save workflow cannot represent its credit, repayment, promise, or product details');
});

test('an invoice or delivery discrepancy note cannot auto-post only its recognized good stock lines', () => {
  const catalog: CatalogItem[] = [
    { id: 'maggi-packet', name: 'Maggi', packSize: '70 g', unit: 'packet', aliases: ['maggi'] },
  ];
  const analysis = analyzeHomeNote('Sharma ji ne 4 packets maggi bheje, 1 damaged and invoice total ₹200', customers, suppliers, '2026-11-25', catalog);

  assert.equal(analysis.events[0]?.kind, 'supplier');
  assert.ok(analysis.unresolvedSegments.length > 0,
    'unparsed invoice and condition details must block stock mutation instead of disappearing');
});

test('automatic note analysis refuses to select between same-unit product variants', () => {
  const catalog: CatalogItem[] = [
    { id: 'maggi-70g', name: 'Maggi', packSize: '70 g', unit: 'packet', aliases: ['maggi'] },
    { id: 'maggi-280g', name: 'Maggi', packSize: '280 g', unit: 'packet', aliases: ['maggi'] },
  ];
  const analysis = analyzeHomeNote('Sharma ji ne 4 packets maggi bheje', customers, suppliers, '2026-11-25', catalog);
  assert.equal(analysis.events[0]?.kind, 'supplier');
  assert.equal(analysis.events[0]?.lines, undefined, 'an unresolved pack-size variant is never guessed');
  assert.deepEqual(analysis.unresolvedSegments, ['Sharma ji ne 4 packets maggi bheje']);
});

test('a mixed note stays unsaved when a spoken item has neither a known product nor an explicit unit', () => {
  const catalog: CatalogItem[] = [
    { id: 'maggi-packet', name: 'Maggi', packSize: '70 g', unit: 'packet', aliases: ['maggi'] },
  ];
  const transcript = 'Sharma ji ne 4 packets maggi bheje aur 2 bread; Raj ne mere se 1 packet maggi kharida';
  const analysis = analyzeHomeNote(transcript, customers, suppliers, '2026-11-26', catalog);

  assert.equal(analysis.events[0]?.kind, 'supplier');
  assert.equal(analysis.events[0]?.lines, undefined);
  assert.deepEqual(analysis.unresolvedSegments, ['Sharma ji ne 4 packets maggi bheje aur 2 bread']);
});

test('an oversized Home note retains its full text and cannot post a valid prefix', () => {
  const catalog: CatalogItem[] = [
    { id: 'maggi-packet', name: 'Maggi', packSize: '70 g', unit: 'packet', aliases: ['maggi'] },
  ];
  const transcript = 'Sharma ji ne 4 packets maggi bheje' + ' '.repeat(3000) + 'aur 2 bread';
  const analysis = analyzeHomeNote(transcript, customers, suppliers, '2026-11-26', catalog);

  assert.equal(analysis.transcript, transcript);
  assert.deepEqual(analysis.events, []);
  assert.deepEqual(analysis.unresolvedSegments, [transcript]);
});

test('a carton is counted as a box only when the shop catalog explicitly identifies that pack as a carton', () => {
  const catalog: CatalogItem[] = [
    { id: 'milk-box', name: 'Milk', packSize: '12 x 500 ml', unit: 'box', aliases: ['doodh', 'milk'] },
  ];
  const configured: CatalogItem[] = [
    { ...catalog[0], packSize: 'carton · 12 x 500 ml', packageContent: '12 x 500 ml' },
    { id: 'milk-packet', name: 'Milk', packSize: '500 ml', unit: 'packet', aliases: ['doodh', 'milk'] },
  ];
  for (const unit of ['cartons', 'ctn', 'कार्टन']) {
    const note = `Sharma ji ne 4 ${unit} doodh bheje`;
    const analysis = analyzeHomeNote(note, customers, suppliers, '2026-11-25', catalog);
    assert.equal(analysis.events[0]?.lines, undefined);
    assert.deepEqual(analysis.unresolvedSegments, [note], 'a generic box does not establish a carton mapping');
    const resolved = analyzeHomeNote(note, customers, suppliers, '2026-11-25', configured);
    assert.deepEqual(resolved.unresolvedSegments, []);
    assert.deepEqual(resolved.events[0]?.lines?.map(({ catalogueItemId, quantity }) => [catalogueItemId, quantity]), [['milk-packet', 48]]);
  }
});

test('unclear shop notes are not silently assigned to a ledger', () => {
  assert.equal(classifyHomeCapture('Maggi ka 2 packet.', customers, suppliers, '2026-11-24'), 'choose');
});

test('retail purchase auto-resolution requires one known customer and exact catalog quantities', () => {
  const catalog = [
    { id: 'maggi-packet', name: 'Maggi', packSize: '70 g', unit: 'packet' as const, aliases: ['maggi'] },
    { id: 'milk-packet', name: 'Milk', packSize: '500 ml', unit: 'packet' as const, aliases: ['doodh', 'milk'] },
  ];
  const tinku = { id: 'tinku', name: 'Tinku ji', aliases: ['Tinku'], createdAt: '', balancePaise: 0, openPromiseCount: 0 };
  const note = 'Tinku ji ne aaj mere se 2 packets maggi kharide hain aur 2 packets doodh';
  assert.deepEqual(resolveRetailPurchase(note, [tinku], catalog), {
    customerId: 'tinku', customerLabel: 'Tinku ji', sourceText: note,
    lines: [{ catalogueItemId: 'maggi-packet', quantity: 2 }, { catalogueItemId: 'milk-packet', quantity: 2 }],
  });
  assert.equal(resolveRetailPurchase(note, [tinku, { ...tinku, id: 'tinku-2', name: 'Tinku Stores' }], catalog), null,
    'ambiguous customer identity must remain unresolved');
  assert.equal(resolveRetailPurchase(note, [tinku], [{ ...catalog[0], id: 'm1' }, { ...catalog[0], id: 'm2' }, catalog[1]]), null,
    'ambiguous product identity must remain unresolved');
});
