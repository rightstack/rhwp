// [lily] text.insert RPC: 인자 검증과 줄바꿈 = 문단 나누기
import test from 'node:test';
import assert from 'node:assert/strict';

import { routeEmbedRequest, type EmbedRpcHandlers } from '../src/embed/rpc-router.ts';
import { applyTextInsert, parseTextInsert, type TextInsertWasm } from '../src/embed/text-ops.ts';

/** 문단 글만 가진 가짜 코어(구역 하나). insertText·splitParagraph 는 코어와 같은 JSON 을 돌려준다 */
function fakeWasm(paras: string[]): TextInsertWasm & { paras: string[]; calls: string[] } {
  const cp = (s: string) => Array.from(s);
  const self = {
    paras,
    calls: [] as string[],
    getSectionCount: () => 1,
    getParagraphCount: (s: number) => (s === 0 ? self.paras.length : 0),
    getParagraphLength: (_s: number, p: number) => cp(self.paras[p]).length,
    insertText(_s: number, p: number, o: number, t: string) {
      self.calls.push(`insert ${p}:${o} ${t}`);
      const c = cp(self.paras[p]);
      self.paras[p] = [...c.slice(0, o), t, ...c.slice(o)].join('');
      return JSON.stringify({ ok: true, charOffset: o + cp(t).length });
    },
    splitParagraph(_s: number, p: number, o: number) {
      self.calls.push(`split ${p}:${o}`);
      const c = cp(self.paras[p]);
      self.paras.splice(p, 1, c.slice(0, o).join(''), c.slice(o).join(''));
      return JSON.stringify({ ok: true, paraIdx: p + 1, charOffset: 0 });
    },
  };
  return self;
}

test('[lily] text.insert 는 줄마다 글을 넣고 줄 사이마다 문단을 나눈다', () => {
  const w = fakeWasm(['', '둘째']);
  assert.deepEqual(applyTextInsert(w, { section: 0, paragraph: 0, offset: 0, text: '첫 줄\n둘째 줄' }), { section: 0, paragraph: 1, offset: 4, paragraphsAdded: 1 });
  assert.deepEqual(w.paras, ['첫 줄', '둘째 줄', '둘째']);
  assert.deepEqual(w.calls, ['insert 0:0 첫 줄', 'split 0:3', 'insert 1:0 둘째 줄']);

  // 문단 가운데에 넣으면 뒤쪽 글은 마지막 줄 뒤로 간다. 빈 줄 = 빈 문단
  const m = fakeWasm(['앞뒤']);
  assert.deepEqual(applyTextInsert(m, { section: 0, paragraph: 0, offset: 1, text: 'A\n\nB' }), { section: 0, paragraph: 2, offset: 1, paragraphsAdded: 2 });
  assert.deepEqual(m.paras, ['앞A', '', 'B뒤']);

  // 본문 밖 좌표는 아무것도 바꾸지 않는다
  const o = fakeWasm(['가']);
  assert.equal(applyTextInsert(o, { section: 0, paragraph: 3, offset: 0, text: 'x' }), null);
  assert.equal(applyTextInsert(o, { section: 0, paragraph: 0, offset: 5, text: 'x' }), null);
  assert.equal(applyTextInsert(o, { section: 1, paragraph: 0, offset: 0, text: 'x' }), null);
  assert.deepEqual(o.calls, []);
});

test('[lily] text.insert 인자를 검증한다(CRLF 는 줄바꿈, 다른 제어 문자는 거절)', async () => {
  assert.equal(parseTextInsert({ section: 0, paragraph: 1, offset: 2, text: 'a\r\nb\rc' }).text, 'a\nb\nc');
  const calls: unknown[] = [];
  const handlers = {
    textInsert: async (r: unknown) => { calls.push(r); return { ok: true, section: 0, paragraph: 0, offset: 1, paragraphsAdded: 0 }; },
  } as unknown as EmbedRpcHandlers;
  assert.deepEqual(await routeEmbedRequest('text.insert', { section: 0, paragraph: 0, offset: 0, text: '가' }, handlers), { ok: true, section: 0, paragraph: 0, offset: 1, paragraphsAdded: 0 });
  assert.deepEqual(calls, [{ section: 0, paragraph: 0, offset: 0, text: '가' }]);
  for (const params of [
    { section: 0, paragraph: 0, offset: 0, text: '' },
    { section: 0, paragraph: 0, offset: 0, text: '탭\t' },
    { section: 0, paragraph: 0, offset: 0, text: '\u0007' },
    { section: -1, paragraph: 0, offset: 0, text: 'a' },
    { section: 0, paragraph: 0.5, offset: 0, text: 'a' },
    { section: 0, paragraph: 0, text: 'a' },
    { section: 0, paragraph: 0, offset: 0, text: 'a', extra: 1 },
  ]) {
    await assert.rejects(() => routeEmbedRequest('text.insert', params, handlers));
  }
});
