import assert from 'node:assert/strict';
import test from 'node:test';
import { homeActionLayout } from '../src/home-action-layout.ts';

test('regular iPhones fan three independent targets upward from the lower-right Plus', () => {
  const anchor = { x: 348, y: 710 };
  const layout = homeActionLayout(anchor, 390, 59, 1);
  assert.equal(layout.compact, false);
  for (const [index, point] of layout.points.entries()) {
    assert.ok(point.x - layout.width / 2 >= 16);
    assert.ok(point.x + layout.width / 2 <= 374);
    assert.ok(point.y + layout.height / 2 < anchor.y - 29);
    if (index) assert.ok(point.x - layout.points[index - 1].x >= layout.width);
  }
});

test('compact phones and large text show distinct full width action rows', () => {
  for (const [width, fontScale] of [[320, 1], [390, 2]]) {
    const layout = homeActionLayout({ x: width - 48, y: 520 }, width, 48, fontScale);
    assert.equal(layout.compact, true);
    for (const [index, point] of layout.points.entries()) {
      assert.ok(point.x + layout.width / 2 <= width - 16);
      assert.ok(point.y - layout.height / 2 >= 48);
      assert.ok(point.y + layout.height / 2 < 520 - 29);
      if (index) assert.ok(point.y - layout.points[index - 1].y >= layout.height);
    }
  }
});
