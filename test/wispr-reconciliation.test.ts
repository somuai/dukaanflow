import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_CATALOG } from '../src/domain.ts';
import { suggestDictatedDeliveryCounts } from '../src/wispr-reconciliation.ts';

test('Wispr delivery dictation suggests editable good, damaged and missing counts', () => {
  const suggestions = suggestDictatedDeliveryCounts(
    'Maggi ten good, one damaged, one missing.',
    [{ id: 'maggi', rawDescription: 'Maggi Masala', catalogueItemId: 'maggi-70g', billedQuantity: 12 }],
    DEMO_CATALOG,
  );
  assert.deepEqual(suggestions, [{ lineId: 'maggi', good: '10', damaged: '1', missing: '1' }]);
});

test('Hindi numbers and condition words produce the same editable suggestions', () => {
  const suggestions = suggestDictatedDeliveryCounts(
    'मैगी दस सही, एक खराब, एक कम',
    [{ id: 'maggi', rawDescription: 'मैगी', catalogueItemId: 'maggi-70g', billedQuantity: 12 }],
    DEMO_CATALOG,
  );
  assert.deepEqual(suggestions, [{ lineId: 'maggi', good: '10', damaged: '1', missing: '1' }]);
});

test('common Hindi and Hinglish numbers across the teen-to-twenty range are recognized', () => {
  const hinglish = suggestDictatedDeliveryCounts(
    'Maggi gyarah good, ek damaged.',
    [{ id: 'maggi', rawDescription: 'Maggi', catalogueItemId: 'maggi-70g', billedQuantity: 12 }],
    DEMO_CATALOG,
  );
  const hindi = suggestDictatedDeliveryCounts(
    'मैगी सोलह सही, एक खराब, एक कम',
    [{ id: 'maggi', rawDescription: 'मैगी', catalogueItemId: 'maggi-70g', billedQuantity: 18 }],
    DEMO_CATALOG,
  );
  assert.deepEqual(hinglish, [{ lineId: 'maggi', good: '11', damaged: '1', missing: '0' }]);
  assert.deepEqual(hindi, [{ lineId: 'maggi', good: '16', damaged: '1', missing: '1' }]);
});

test('multi-line dictation is matched to explicit product mentions and stays balanced', () => {
  const suggestions = suggestDictatedDeliveryCounts(
    'Maggi ten good, one damaged, one missing. Surf Excel six good.',
    [
      { id: 'maggi', rawDescription: 'Maggi', catalogueItemId: 'maggi-70g', billedQuantity: 12 },
      { id: 'surf', rawDescription: 'Surf Excel', catalogueItemId: 'surf-excel-500g', billedQuantity: 6 },
    ],
    DEMO_CATALOG,
  );
  assert.deepEqual(suggestions, [
    { lineId: 'maggi', good: '10', damaged: '1', missing: '1' },
    { lineId: 'surf', good: '6', damaged: '0', missing: '0' },
  ]);
});

test('unbalanced or ambiguous dictated counts are not applied', () => {
  const ambiguous = suggestDictatedDeliveryCounts(
    'Maggi ten good, one damaged, one missing.',
    [
      { id: 'small', rawDescription: 'Maggi', catalogueItemId: 'maggi-70g', billedQuantity: 12 },
      { id: 'large', rawDescription: 'Maggi', catalogueItemId: 'maggi-280g', billedQuantity: 12 },
    ],
    DEMO_CATALOG,
  );
  const unbalanced = suggestDictatedDeliveryCounts(
    'Maggi 11 good and 2 damaged.',
    [{ id: 'maggi', rawDescription: 'Maggi', catalogueItemId: 'maggi-70g', billedQuantity: 12 }],
    DEMO_CATALOG,
  );
  assert.deepEqual(ambiguous, []);
  assert.deepEqual(unbalanced, []);
});

test('an explicit pack size disambiguates matching product variants', () => {
  const suggestions = suggestDictatedDeliveryCounts(
    'Maggi 70 g 10 good, 1 damaged, 1 missing. Maggi 280 g 5 good, 1 damaged.',
    [
      { id: 'small', rawDescription: 'Maggi', catalogueItemId: 'maggi-70g', billedQuantity: 12 },
      { id: 'large', rawDescription: 'Maggi', catalogueItemId: 'maggi-280g', billedQuantity: 6 },
    ],
    DEMO_CATALOG,
  );
  assert.deepEqual(suggestions, [
    { lineId: 'small', good: '10', damaged: '1', missing: '1' },
    { lineId: 'large', good: '5', damaged: '1', missing: '0' },
  ]);
});
