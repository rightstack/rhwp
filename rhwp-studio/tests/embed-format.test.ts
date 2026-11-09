// [lily] format.* RPC: 단위 변환(px·HWPUNIT ↔ pt)과 인자 검증
import test from 'node:test';
import assert from 'node:assert/strict';

import { charMods, embedFormatState, paraMods, parseCharFormat, parseParaFormat } from '../src/embed/format-bridge.ts';
import { routeEmbedRequest, type EmbedRpcHandlers } from '../src/embed/rpc-router.ts';

test('[lily] embedFormatState는 px·HWPUNIT 을 pt 로 바꾼다', () => {
  const s = embedFormatState(
    { fontFamily: '함초롬바탕', fontSize: 1000, bold: true, superscript: false, textColor: '#000000' },
    { alignment: 'center', lineSpacingType: 'Percent', lineSpacing: 160, marginLeft: 20, marginRight: 0, indent: -10, spacingBefore: 4, spacingAfter: 0 },
  );
  assert.deepEqual(s.char, {
    fontName: '함초롬바탕', fontSizePt: 10, textColor: '#000000',
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
  assert.deepEqual(parseParaFormat({ lineSpacingType: 'Minimum' }), { lineSpacingType: 'Minimum' });
});
