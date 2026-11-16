// [lily] field.* RPC: 인자 검증과 누름틀 목록(가상 셀 필드 · 다른 필드는 뺀다)
import test from 'node:test';
import assert from 'node:assert/strict';

import { routeEmbedRequest, type EmbedRpcHandlers } from '../src/embed/rpc-router.ts';
import { listClickHereFields } from '../src/embed/field-ops.ts';

test('[lily] field.insert · field.set 인자를 검증한다', async () => {
  const calls: unknown[] = [];
  const handlers = {
    fieldInsert: async (r: unknown) => { calls.push(r); return { ok: true, fieldId: 1 }; },
    fieldSet: async (r: unknown) => { calls.push(r); return { ok: true, fieldId: 1 }; },
    fieldList: async () => { calls.push('list'); return []; },
  } as unknown as EmbedRpcHandlers;
  await routeEmbedRequest('field.insert', { name: ' 이름 ', guide: '하늘이' }, handlers);
  await routeEmbedRequest('field.insert', {}, handlers);
  await routeEmbedRequest('field.insert', { name: '기간', guide: '', memo: '언제', editable: false }, handlers);
  await routeEmbedRequest('field.set', { name: '이름', value: '김하늘' }, handlers);
  await routeEmbedRequest('field.set', { name: '이름', occurrence: 2, value: '' }, handlers);
  await routeEmbedRequest('field.set', { fieldId: 7, value: '가' }, handlers);
  await routeEmbedRequest('field.list', {}, handlers);
  assert.deepEqual(calls, [
    { name: '이름', guide: '하늘이', memo: '', editable: true },
    { name: '', guide: '', memo: '', editable: true },
    { name: '기간', guide: '', memo: '언제', editable: false },
    { name: '이름', value: '김하늘' },
    { name: '이름', occurrence: 2, value: '' },
    { fieldId: 7, value: '가' },
    'list',
  ]);
  for (const bad of [{ name: 3 }, { guide: '줄\n바꿈' }, { name: 'x'.repeat(65) }, { editable: 'yes' }, { name: 'a', extra: 1 }]) {
    await assert.rejects(() => routeEmbedRequest('field.insert', bad, handlers), JSON.stringify(bad));
  }
  for (const bad of [{ value: 'x' }, { name: '이름', fieldId: 1, value: 'x' }, { name: '이름' }, { name: '', value: 'x' }, { fieldId: -1, value: 'x' },
    { fieldId: 1, occurrence: 0, value: 'x' }, { name: '이름', occurrence: 1.5, value: 'x' }, { name: '이름', value: '탭\t' }, { name: '이름', value: 'x', other: 1 }]) {
    await assert.rejects(() => routeEmbedRequest('field.set', bad, handlers), JSON.stringify(bad));
  }
  await assert.rejects(() => routeEmbedRequest('field.list', { all: true }, handlers));
});

test('[lily] 누름틀 목록은 문단 안 누름틀만 문서 차례로 준다', () => {
  const wasm = {
    getFieldList: () => [
      { fieldId: 1, fieldType: 'clickhere', cellField: false, name: '이름', guide: '하늘이', command: '', value: '', location: { sectionIndex: 0, paraIndex: 2 }, startCharIdx: 4, endCharIdx: 4 },
      { fieldId: 2, fieldType: 'clickhere', cellField: true, name: '칸', guide: '', command: '', value: '', location: { sectionIndex: 0, paraIndex: 3, path: [{}] } },
      { fieldId: 3, fieldType: 'hyperlink', cellField: false, name: '', guide: '', command: '', value: 'x', location: { sectionIndex: 0, paraIndex: 0 } },
      { fieldId: 4, fieldType: 'clickhere', cellField: false, name: '기간', guide: '', command: '', value: '11월', location: { sectionIndex: 0, paraIndex: 3, path: [{ type: 'cell' }] }, startCharIdx: 0, endCharIdx: 3 },
    ],
  };
  assert.deepEqual(listClickHereFields(wasm as never), [
    { fieldId: 1, name: '이름', guide: '하늘이', value: '', section: 0, paragraph: 2, nested: false, start: 4, end: 4 },
    { fieldId: 4, name: '기간', guide: '', value: '11월', section: 0, paragraph: 3, nested: true, start: 0, end: 3 },
  ]);
});
