// [lily] format.* RPC: 단위 변환(px·HWPUNIT ↔ pt)과 인자 검증
import test from 'node:test';
import assert from 'node:assert/strict';

import { charMods, embedFormatState, embedStyleList, paraMods, parseCharFormat, parseParaFormat } from '../src/embed/format-bridge.ts';
import { routeEmbedRequest, type EmbedRpcHandlers } from '../src/embed/rpc-router.ts';

test('[lily] embedFormatState는 px·HWPUNIT 을 pt 로 바꾼다', () => {
  const s = embedFormatState(
    { fontFamily: '함초롬바탕', fontSize: 1000, bold: true, superscript: false, textColor: '#000000' },
    { alignment: 'center', lineSpacingType: 'Percent', lineSpacing: 160, marginLeft: 20, marginRight: 0, indent: -10, spacingBefore: 4, spacingAfter: 0 },
  );
  assert.deepEqual(s.char, {
    fontName: '함초롬바탕', fontSizePt: 10, textColor: '#000000', shadeColor: null,
    bold: true, italic: false, underline: false, strikethrough: false, superscript: false, subscript: false,
  });
  assert.deepEqual(s.para, {
    alignment: 'center', lineSpacingType: 'Percent', lineSpacing: 160,
    marginLeftPt: 15, marginRightPt: 0, indentPt: -7.5, spacingBeforePt: 3, spacingAfterPt: 0,
  });
  // 고정 줄 간격은 px → pt
  assert.equal(embedFormatState(null, { lineSpacingType: 'Fixed', lineSpacing: 24 }).para.lineSpacing, 18);
  assert.equal(embedFormatState(null, null).char.fontSizePt, null);
});

test('[lily] paraMods·charMods는 ParaShapeDialog·서식 줄과 같은 단위를 쓴다', () => {
  assert.deepEqual(paraMods({ marginLeftPt: 15, indentPt: -7.5, spacingBeforePt: 3, lineSpacing: 200 }, 'Percent'), {
    lineSpacing: 200, marginLeft: 3000, indent: -1500, spacingBefore: 300,
  });
  assert.deepEqual(paraMods({ lineSpacing: 18 }, 'Fixed'), { lineSpacing: 1800 });
  assert.deepEqual(paraMods({ lineSpacingType: 'Percent', lineSpacing: 130 }, 'Fixed'), { lineSpacingType: 'Percent', lineSpacing: 130 });
  assert.deepEqual(charMods({ fontSizePt: 11.5, superscript: true }), { fontSize: 1150, superscript: true, subscript: false });
});

test('[lily] embed router는 format 인자를 검증한다', async () => {
  const calls: unknown[] = [];
  const handlers = {
    formatGet: async () => embedFormatState(null, null),
    formatSetChar: async (p: unknown) => { calls.push(['char', p]); return { ok: true }; },
    formatSetPara: async (p: unknown) => { calls.push(['para', p]); return { ok: true }; },
  } as unknown as EmbedRpcHandlers;
  await routeEmbedRequest('format.setChar', { props: { bold: true, fontSizePt: 12 } }, handlers);
  await routeEmbedRequest('format.setPara', { props: { alignment: 'left', indentPt: -4 } }, handlers);
  assert.deepEqual(calls, [['char', { fontSizePt: 12, bold: true }], ['para', { alignment: 'left', indentPt: -4 }]]);
  for (const [method, props] of [
    ['format.setChar', {}],
    ['format.setChar', { bold: 'yes' }],
    ['format.setChar', { fontSizePt: 0 }],
    ['format.setChar', { fontFamily: 'x' }],
    ['format.setChar', { textColor: 'red' }],
    ['format.setPara', { alignment: 'middle' }],
    ['format.setPara', { marginLeftPt: -1 }],
    ['format.setPara', null],
  ] as const) {
    await assert.rejects(() => routeEmbedRequest(method, { props }, handlers));
  }
  assert.throws(() => parseCharFormat([]));
  // 단·줄·칸
  const caret = { page: 0, column: 1, line: 3, char: 5 };
  assert.deepEqual(await routeEmbedRequest('status.caret', {}, { statusCaret: async () => caret } as unknown as EmbedRpcHandlers), caret);
});

test('[lily] select.range는 문단 오프셋 범위만 받는다', async () => {
  const got: unknown[] = [];
  const handlers = { selectRange: async (r: unknown) => { got.push(r); return { selected: true }; } } as unknown as EmbedRpcHandlers;
  const range = { section: 0, paragraph: 3, start: 2, end: 5 };
  assert.deepEqual(await routeEmbedRequest('select.range', { range }, handlers), { selected: true });
  assert.deepEqual(got, [range]);
  for (const bad of [
    { section: 0, paragraph: 3, start: 5, end: 2 },
    { section: -1, paragraph: 0, start: 0, end: 0 },
    { section: 0, paragraph: 0, start: 0.5, end: 1 },
    { section: 0, paragraph: 0, start: 0, end: 1, extra: 1 },
    { section: 0, paragraph: 0, start: 0 },
  ]) {
    await assert.rejects(() => routeEmbedRequest('select.range', { range: bad }, handlers));
  }
  assert.deepEqual(parseParaFormat({ lineSpacingType: 'Minimum' }), { lineSpacingType: 'Minimum' });
});

test('[lily] memo.insert·memo.edit 인자를 검증한다', async () => {
  const calls: unknown[] = [];
  const handlers = {
    memoInsert: async (r: unknown) => { calls.push(['insert', r]); return { ok: true, memoIndex: 1 }; },
    memoEdit: async (r: unknown) => { calls.push(['edit', r]); return { ok: true }; },
  } as unknown as EmbedRpcHandlers;
  assert.deepEqual(await routeEmbedRequest('memo.insert', { text: '확인 필요', author: '영일' }, handlers), { ok: true, memoIndex: 1 });
  await routeEmbedRequest('memo.insert', { text: '작성자 없음' }, handlers);
  await routeEmbedRequest('memo.edit', { memoIndex: 2, text: '고침' }, handlers);
  assert.deepEqual(calls, [
    ['insert', { text: '확인 필요', author: '영일' }],
    ['insert', { text: '작성자 없음', author: '' }],
    ['edit', { memoIndex: 2, text: '고침' }],
  ]);
  for (const [method, params] of [
    ['memo.insert', { text: '' }],
    ['memo.insert', { text: '   ' }],
    ['memo.insert', { text: 'a', author: 3 }],
    ['memo.insert', { text: 'a', extra: 1 }],
    ['memo.edit', { memoIndex: 0, text: 'a' }],
    ['memo.edit', { memoIndex: 1.5, text: 'a' }],
    ['memo.edit', { memoIndex: 1 }],
  ] as const) {
    await assert.rejects(() => routeEmbedRequest(method, params, handlers));
  }
});

test('[lily] table.insert 인자를 검증한다', async () => {
  const calls: unknown[] = [];
  const handlers = { tableInsert: async (r: unknown) => { calls.push(r); return { ok: true, paragraph: 2, rows: 1, cols: 2 }; } } as unknown as EmbedRpcHandlers;
  assert.deepEqual(await routeEmbedRequest('table.insert', { rows: 1, cols: 2, cells: [['학년', '']] }, handlers), { ok: true, paragraph: 2, rows: 1, cols: 2 });
  await routeEmbedRequest('table.insert', { rows: 3, cols: 4 }, handlers);
  assert.deepEqual(calls, [{ rows: 1, cols: 2, cells: [['학년', '']] }, { rows: 3, cols: 4 }]);
  // [lily] 칸 꾸밈은 그대로 넘어간다
  const look = { widthsMm: [30, 60], heightsMm: [9], format: [{ rows: [0, 0] as [number, number], fill: '#EEF2FF', bold: true, align: 'center' as const, border: { color: '#4F46E5' } }] };
  await routeEmbedRequest('table.insert', { rows: 2, cols: 2, cells: [['이름', '값']], ...look }, handlers);
  assert.deepEqual(calls[2], { rows: 2, cols: 2, cells: [['이름', '값']], ...look });
  for (const bad of [
    { rows: 0, cols: 2 },
    { rows: 2, cols: 21 },
    { rows: 1.5, cols: 2 },
    { rows: 1, cols: 2, cells: [['a', 'b', 'c']] },
    { rows: 1, cols: 2, cells: [['a'], ['b']] },
    { rows: 1, cols: 2, cells: [['줄\n바꿈']] },
    { rows: 1, cols: 2, cells: [[3]] },
    { rows: 1, cols: 2, cells: 'x' },
    { rows: 1, cols: 2, extra: 1 },
    // [lily] 칸 꾸밈
    { rows: 1, cols: 2, widthsMm: [10, 20, 30] },
    { rows: 1, cols: 2, heightsMm: [0] },
    { rows: 2, cols: 2, format: [{ rows: [0, 2] }] },
    { rows: 2, cols: 2, format: [{ fill: 'red' }] },
    { rows: 2, cols: 2, format: [{ border: { color: '#000000', width: 9 } }] },
    { rows: 2, cols: 2, format: [{ vAlign: 'middle' }] },
    { rows: 2, cols: 2, format: [{ shadow: true }] },
  ]) {
    await assert.rejects(() => routeEmbedRequest('table.insert', bad, handlers), JSON.stringify(bad));
  }
});

test('[lily] page.setFill · shape.insert 인자를 검증한다', async () => {
  const calls: unknown[] = [];
  const handlers = {
    pageSetFill: async (r: unknown) => { calls.push(r); return { ok: true }; },
    shapeInsert: async (r: unknown) => { calls.push(r); return { ok: true }; },
  } as unknown as EmbedRpcHandlers;
  await routeEmbedRequest('page.setFill', { color: '#FCE7F3' }, handlers);
  await routeEmbedRequest('page.setFill', { color: null }, handlers);
  await routeEmbedRequest('shape.insert', { kind: 'star', xMm: 20, yMm: 30, widthMm: 9, heightMm: 9, fill: '#DB2777', transparency: 45 }, handlers);
  assert.deepEqual(calls, [{ color: '#fce7f3' }, { color: null }, { kind: 'star', xMm: 20, yMm: 30, widthMm: 9, heightMm: 9, fill: '#db2777', transparency: 45 }]);
  for (const bad of [{ color: 'pink' }, {}, { color: '#FFF' }, { color: '#ffffff', extra: 1 }]) {
    await assert.rejects(() => routeEmbedRequest('page.setFill', bad, handlers), JSON.stringify(bad));
  }
  const shape = { kind: 'ellipse', xMm: 0, yMm: 0, widthMm: 10, heightMm: 10, fill: '#000000' };
  for (const bad of [{ ...shape, kind: 'heart' }, { ...shape, widthMm: 0 }, { ...shape, xMm: -1 }, { ...shape, fill: 'red' }, { ...shape, transparency: 101 }, { ...shape, rotate: 3 }]) {
    await assert.rejects(() => routeEmbedRequest('shape.insert', bad, handlers), JSON.stringify(bad));
  }
});

test('[lily] 음영(형광펜) shadeColor 읽기·쓰기', async () => {
  assert.equal(embedFormatState({ shadeColor: '#ffff00' }, null).char.shadeColor, '#ffff00');
  assert.deepEqual(parseCharFormat({ shadeColor: '#FFFF00' }), { shadeColor: '#ffff00' });
  assert.deepEqual(charMods({ shadeColor: '#ffffff' }), { shadeColor: '#ffffff' });
  assert.throws(() => parseCharFormat({ shadeColor: 'yellow' }));
});

test('[lily] style.list 는 스타일 목록과 캐럿 스타일을 돌려준다', async () => {
  const list = embedStyleList([{ id: 0, name: '바탕글', englishName: 'Normal' }, { id: 2, name: '개요 1' }], { id: 2, name: '개요 1' });
  assert.deepEqual(list, {
    styles: [{ id: 0, name: '바탕글', englishName: 'Normal' }, { id: 2, name: '개요 1', englishName: '' }],
    current: { id: 2, name: '개요 1' },
  });
  assert.equal(embedStyleList([], { id: Number.NaN, name: '?' }).current, null);
  const handlers = { styleList: async () => list } as unknown as EmbedRpcHandlers;
  assert.deepEqual(await routeEmbedRequest('style.list', {}, handlers), list);
});
