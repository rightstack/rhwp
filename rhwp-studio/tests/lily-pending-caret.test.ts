// [lily] 대기 서식(선택 없이 준 글자 크기)의 캐럿 높이
import test from 'node:test';
import assert from 'node:assert/strict';

import { caretRectForPendingSize, compositionFontPx } from '../src/engine/pending-caret.ts';

const rect = { pageIndex: 0, x: 10, y: 100, height: 13.3 };

test('a pending 20pt size makes the caret 20pt tall and keeps its top', () => {
  const out = caretRectForPendingSize(rect, 2000);
  assert.equal(out.y, 100);
  assert.ok(Math.abs(out.height - 26.67) < 0.01);
  assert.equal(out.x, 10);
});

test('no pending size, a bad one or the same size leaves the rect as it is', () => {
  assert.equal(caretRectForPendingSize(rect, undefined), rect);
  assert.equal(caretRectForPendingSize(rect, 0), rect);
  assert.equal(caretRectForPendingSize(rect, Number.NaN), rect);
  assert.equal(caretRectForPendingSize(rect, 1000), rect);
});

// [lily] T4-08: 조합 상자 글자 = 캔버스 글자 크기(upstream 은 상자 높이 × 0.85)
test('the composition glyph is drawn at the character size, scaled by zoom', () => {
  assert.ok(Math.abs(compositionFontPx(13.33, 1000, 1) - 13.33) < 0.01);
  assert.ok(Math.abs(compositionFontPx(26.67, 2000, 1.5) - 40) < 0.01);
});

test('a box clipped by a cell caps the glyph; an unknown size falls back to the box height', () => {
  assert.ok(Math.abs(compositionFontPx(20, 2000, 1) - 20) < 0.01);
  assert.equal(compositionFontPx(16, undefined, 2), 32);
  assert.equal(compositionFontPx(16, 0, 1), 16);
});
