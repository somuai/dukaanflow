import assert from 'node:assert/strict';
import test from 'node:test';
import { updateHomeNoteDraft } from '../src/home-note-draft.ts';

test('switching shops preserves each unsaved note independently', () => {
  let drafts = new Map<string, string>();
  drafts = updateHomeNoteDraft(drafts, 'shop-a', 'Sharma sent 4 cartons');
  assert.equal(drafts.get('shop-b'), undefined);
  drafts = updateHomeNoteDraft(drafts, 'shop-b', 'Tinku paid ₹200');
  assert.equal(drafts.get('shop-a'), 'Sharma sent 4 cartons');
  assert.equal(drafts.get('shop-b'), 'Tinku paid ₹200');
});

test('a completed save clears only its original shop and unchanged text', () => {
  const drafts = new Map([['shop-a', 'Edited supplier note'], ['shop-b', 'Other draft']]);
  assert.strictEqual(updateHomeNoteDraft(drafts, 'shop-a', '', 'Original supplier note'), drafts);
  const saved = updateHomeNoteDraft(drafts, 'shop-a', '', 'Edited supplier note');
  assert.equal(saved.has('shop-a'), false);
  assert.equal(saved.get('shop-b'), 'Other draft');
});
