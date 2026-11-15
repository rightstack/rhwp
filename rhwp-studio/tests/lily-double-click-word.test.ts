// [lily] 글 위 더블클릭 = 낱말 선택: 낱말 범위 판정
import test from 'node:test';
import assert from 'node:assert/strict';

import { findWordForDoubleClick } from '../src/engine/word-range.ts';

test('a double-click inside a word selects that word', () => {
  assert.deepEqual(findWordForDoubleClick('hello world again', 8), { start: 6, end: 11 });
  assert.deepEqual(findWordForDoubleClick('한글 입력하면 잘 되요', 4), { start: 3, end: 7 });
});

test('the right half of the last letter (offset just after the word) still selects the word', () => {
  assert.deepEqual(findWordForDoubleClick('hello world', 5), { start: 0, end: 5 });
  assert.deepEqual(findWordForDoubleClick('hello world', 11), { start: 6, end: 11 });
});

test('no word under the click makes no selection', () => {
  assert.equal(findWordForDoubleClick('', 0), null);
  assert.equal(findWordForDoubleClick('a  .  b', 3), null);
  assert.equal(findWordForDoubleClick('   ', 1), null);
});
