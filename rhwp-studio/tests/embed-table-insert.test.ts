// [lily] table.insert: 칸 안 여백(cellPaddingMm)과 빈 칸 글자 꾸밈 — 인자 검증·가짜 코어 위 동작
import test from 'node:test';
import assert from 'node:assert/strict';

import { insertTableAtCaret, parseTableInsert } from '../src/embed/table-ops.ts';

test('[lily] table.insert 인자: cellPaddingMm 은 네 변(mm, 0–50)만', () => {
  assert.deepEqual(parseTableInsert({ rows: 2, cols: 2, cellPaddingMm: { top: 1.76, bottom: 1.76 } }).cellPaddingMm, { top: 1.76, bottom: 1.76 });
  assert.throws(() => parseTableInsert({ rows: 2, cols: 2, cellPaddingMm: { middle: 1 } }), /not a known side/);
  assert.throws(() => parseTableInsert({ rows: 2, cols: 2, cellPaddingMm: { top: 51 } }), /0 to 50/);
  assert.throws(() => parseTableInsert({ rows: 2, cols: 2, cellPaddingMm: 3 }), /object/);
  assert.equal(parseTableInsert({ rows: 2, cols: 2 }).cellPaddingMm, undefined);
});

test('[lily] table.insert: 여백은 표와 모든 칸에, 글자 크기는 빈 칸에도 — 한 snapshot', () => {
  const calls: unknown[][] = [];
  const wasm = {
    createTable: () => ({ ok: true, paraIdx: 3, controlIdx: 0 }),
    insertTextInCell: (...a: unknown[]) => calls.push(['text', ...a]),
    setTableProperties: (...a: unknown[]) => calls.push(['table', ...a]),
    setCellProperties: (...a: unknown[]) => calls.push(['cell', ...a]),
    applyCharFormatInCell: (...a: unknown[]) => calls.push(['char', ...a]),
    applyParaFormatInCell: (...a: unknown[]) => calls.push(['para', ...a]),
  };
  let ops = 0;
  const ih = {
    isCaretInBodyText: () => true,
    getSelection: () => null,
    getCursorPosition: () => ({ sectionIndex: 0, paragraphIndex: 3, charOffset: 0 }),
    executeOperation: (op: { operation: (w: typeof wasm) => unknown }) => {
      ops += 1;
      op.operation(wasm);
    },
    focus: () => {},
  };
  const req = parseTableInsert({ rows: 2, cols: 2, cells: [['번호']], cellPaddingMm: { top: (25.4 / 72) * 5, bottom: (25.4 / 72) * 5 }, format: [{ sizePt: 11 }] });
  const r = insertTableAtCaret(ih as never, req);
  assert.deepEqual(r, { ok: true, paragraph: 3, rows: 2, cols: 2 });
  assert.equal(ops, 1, '실행 취소 한 단계');
  assert.deepEqual(calls.filter((c) => c[0] === 'table'), [['table', 0, 3, 0, { paddingTop: 500, paddingBottom: 500 }]]);
  assert.deepEqual(
    calls.filter((c) => c[0] === 'cell').map((c) => [c[4], c[5]]),
    [0, 1, 2, 3].map((i) => [i, { paddingTop: 500, paddingBottom: 500 }]),
  );
  const chars = calls.filter((c) => c[0] === 'char');
  assert.equal(chars.length, 4, '빈 칸에도 글자 크기');
  assert.deepEqual(chars[0]!.slice(5), [0, 0, 2, JSON.stringify({ fontSize: 1100 })]);
  assert.deepEqual(chars[1]!.slice(5), [0, 0, 0, JSON.stringify({ fontSize: 1100 })]);
});
