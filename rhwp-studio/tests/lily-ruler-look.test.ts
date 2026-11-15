// [lily] 눈금자 모양 CSS 변수: 주지 않으면 예전 모양, 주면 굵기·글꼴·둥근 띠
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseRulerLook } from '../src/view/ruler-look.ts';

const vars = (map: Record<string, string>) => (name: string) => map[name] ?? '';

test('without host variables the ruler keeps the upstream look', () => {
  assert.deepEqual(parseRulerLook(vars({})), { size: 20, font: '9px sans-serif', radius: 0 });
});

test('host variables set thickness, label font and the rounded page strip', () => {
  assert.deepEqual(
    parseRulerLook(vars({ '--ruler-size': '24px', '--ruler-font': '10px system-ui', '--ruler-radius': '4px' })),
    { size: 24, font: '10px system-ui', radius: 4 },
  );
});

test('out-of-range values are clamped and garbage falls back', () => {
  assert.equal(parseRulerLook(vars({ '--ruler-size': '400px' })).size, 40);
  assert.equal(parseRulerLook(vars({ '--ruler-size': 'wide' })).size, 20);
  assert.equal(parseRulerLook(vars({ '--ruler-radius': '-3px' })).radius, 0);
});
