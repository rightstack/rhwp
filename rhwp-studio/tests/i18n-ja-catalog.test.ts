import test from 'node:test';
import assert from 'node:assert/strict';
import ko from '../src/i18n/locales/ko.ts';
import ja from '../src/i18n/locales/ja.ts';

const placeholders = (s: string) => (s.match(/\{[^}]*\}/g) ?? []).sort().join(',');
const lines = (s: string) => s.split('\n').length;

test('ja 카탈로그는 ko 와 같은 키를 가진다', () => {
  assert.deepEqual(Object.keys(ja).sort(), Object.keys(ko).sort());
});

test('ja 값은 ko 와 같은 자리표시자·줄 수를 쓴다', () => {
  const k = ko as Record<string, string>;
  for (const [key, value] of Object.entries(ja as Record<string, string>)) {
    assert.equal(placeholders(value), placeholders(k[key]!), key);
    assert.equal(lines(value), lines(k[key]!), key);
  }
});
