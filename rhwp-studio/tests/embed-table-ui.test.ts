// [lily] table.* 덧그림 RPC: 인자 검증 · 표 꼴 계산 · 테두리 변 고르기 · 테두리 상태 · 옮기기 막힘
import test from 'node:test';
import assert from 'node:assert/strict';

import { routeEmbedRequest, type EmbedRpcHandlers } from '../src/embed/rpc-router.ts';
import {
  bandRectsOf, bordersState, framesOf, gridOfCells, moveBlocked, ptOfWidthIdx, sidesFor, widthIdxOfPt,
} from '../src/embed/table-ui-ops.ts';

/** 쪽 0 의 rows × cols 칸(칸 100×20, 표 왼쪽 위 = 50,40) */
function cells(rows: number, cols: number, page = 0) {
  const out = [];
  let idx = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) out.push({ cellIdx: idx++, row: r, col: c, rowSpan: 1, colSpan: 1, pageIndex: page, x: 50 + c * 100, y: 40 + r * 20, w: 100, h: 20 });
  }
  return out;
}

test('[lily] table.* 인자를 검증해 처리기로 보낸다', async () => {
  const calls: unknown[] = [];
  const rec = (name: string) => async (r?: unknown) => { calls.push([name, r]); return { ok: true }; };
  const handlers = {
    tableGridAt: rec('gridAt'), tableState: rec('state'), tableBandRects: rec('bandRects'), tableSelect: rec('select'), tableInsertAt: rec('insertAt'),
    tableDeleteLines: rec('deleteLines'), tableMove: rec('move'), tableSetBorders: rec('setBorders'), tableSetCellAlign: rec('setCellAlign'), tableSetHeaderRow: rec('setHeaderRow'),
  } as unknown as EmbedRpcHandlers;
  const ref = { sec: 0, ppi: 2, ci: 0 };
  await routeEmbedRequest('table.gridAt', { page: 1, fx: 0.25, fy: 0.5 }, handlers);
  await routeEmbedRequest('table.state', {}, handlers);
  await routeEmbedRequest('table.select', { ...ref, r0: 0, c0: 0, r1: 2, c1: 1 }, handlers);
  await routeEmbedRequest('table.insertAt', { ...ref, axis: 'col', line: 3 }, handlers);
  await routeEmbedRequest('table.move', { ...ref, axis: 'row', from: 0, line: 3 }, handlers);
  await routeEmbedRequest('table.deleteLines', { what: 'rows' }, handlers);
  await routeEmbedRequest('table.setBorders', { kind: 'outside', on: false, style: 'thick', widthPt: 1.5, color: '#FF0000' }, handlers);
  await routeEmbedRequest('table.setCellAlign', { v: 'center' }, handlers);
  await routeEmbedRequest('table.setHeaderRow', { on: true }, handlers);
  assert.deepEqual(calls, [
    ['gridAt', { page: 1, fx: 0.25, fy: 0.5 }],
    ['state', undefined],
    ['select', { ...ref, r0: 0, c0: 0, r1: 2, c1: 1 }],
    ['insertAt', { ...ref, axis: 'col', line: 3 }],
    ['move', { ...ref, axis: 'row', from: 0, line: 3 }],
    ['deleteLines', { what: 'rows' }],
    ['setBorders', { kind: 'outside', on: false, style: 'single', widthPt: 1.5, color: '#ff0000' }],
    ['setCellAlign', { v: 'center' }],
    ['setHeaderRow', { on: true }],
  ]);
  await assert.rejects(routeEmbedRequest('table.select', { ...ref, r0: 2, c0: 0, r1: 1, c1: 0 }, handlers));
  await assert.rejects(routeEmbedRequest('table.insertAt', { ...ref, axis: 'diag', line: 0 }, handlers));
  await assert.rejects(routeEmbedRequest('table.setBorders', { kind: 'zigzag' }, handlers));
  await assert.rejects(routeEmbedRequest('table.setBorders', { kind: 'all', color: 'red' }, handlers));
  await assert.rejects(routeEmbedRequest('table.deleteLines', { what: 'cells' }, handlers));
  await assert.rejects(routeEmbedRequest('table.gridAt', { page: 0, fx: 1, fy: 2, extra: 1 }, handlers));
});

test('[lily] 한 쪽 칸들 → 열 경계 · 행 띠 · 바깥 틀', () => {
  const g = gridOfCells(cells(3, 2), 2)!;
  assert.deepEqual(g.colLines, [50, 150, 250]);
  assert.deepEqual(g.rowBands, [{ row: 0, top: 40, bottom: 60 }, { row: 1, top: 60, bottom: 80 }, { row: 2, top: 80, bottom: 100 }]);
  assert.deepEqual([g.left, g.top, g.right, g.bottom, g.first], [50, 40, 250, 100, true]);
  // 다음 쪽에 이어진 조각(행 2 만): 첫 행이 없다
  const tail = gridOfCells(cells(3, 2).filter((b) => b.row === 2), 2)!;
  assert.equal(tail.first, false);
  // 모두 가로로 합친 열(열 1 이 시작하는 칸이 없다): 경계를 앞뒤 사이에 고르게
  const merged = [
    { cellIdx: 0, row: 0, col: 0, rowSpan: 1, colSpan: 3, pageIndex: 0, x: 0, y: 0, w: 300, h: 20 },
  ];
  assert.deepEqual(gridOfCells(merged, 3)!.colLines, [0, 100, 200, 300]);
});

test('[lily] 쪽별 틀 · 줄 사각형', () => {
  const two = [...cells(1, 2, 0), ...cells(1, 2, 1).map((b) => ({ ...b, cellIdx: b.cellIdx + 2, row: 1 }))];
  assert.deepEqual(framesOf(two), [[0, 50, 40, 200, 20], [1, 50, 40, 200, 20]]);
  assert.deepEqual(bandRectsOf(cells(3, 2), 'row', 1, 1), [[0, 50, 60, 200, 20]]);
  assert.deepEqual(bandRectsOf(cells(3, 2), 'col', 1, 1), [[0, 150, 40, 100, 60]]);
});

test('[lily] 테두리 종류가 건드리는 변(범위 2×2)', () => {
  const r = { r0: 0, c0: 0, r1: 1, c1: 1 };
  const at = (row: number, col: number) => ({ row, col, rowSpan: 1, colSpan: 1 });
  assert.deepEqual(sidesFor('outside', at(0, 0), r), ['top', 'left']);
  assert.deepEqual(sidesFor('inside', at(0, 0), r), ['bottom', 'right']);
  assert.deepEqual(sidesFor('top', at(1, 1), r), []);
  assert.deepEqual(sidesFor('bottom', at(1, 1), r), ['bottom']);
  assert.deepEqual(sidesFor('all', at(1, 0), r), ['top', 'bottom', 'left', 'right']);
  assert.deepEqual(sidesFor('none', at(1, 0), r), ['top', 'bottom', 'left', 'right']);
});

test('[lily] 테두리 상태 · 굵기 번호 ↔ pt', () => {
  const on = { type: 1, width: 1, color: '#000000' };
  const off = { type: 0, width: 0, color: '#000000' };
  const r = { r0: 0, c0: 0, r1: 0, c1: 1 };
  const bb = cells(1, 2);
  const s = bordersState([
    { b: bb[0]!, lines: { top: on, bottom: on, left: on, right: off } },
    { b: bb[1]!, lines: { top: on, bottom: on, left: off, right: on } },
  ], r);
  assert.deepEqual([s.top, s.bottom, s.left, s.right, s.insideH, s.insideV], [true, true, true, true, false, false]);
  assert.deepEqual(s.span, [1, 2]);
  assert.equal(s.style, 'single');
  const mixed = bordersState([
    { b: bb[0]!, lines: { top: on, bottom: on, left: on, right: on } },
    { b: bb[1]!, lines: { top: off, bottom: on, left: on, right: on } },
  ], r);
  assert.equal(mixed.top, null);
  assert.equal(mixed.insideV, true);
  assert.equal(widthIdxOfPt(1.5), 7); // 0.53mm → 0.5mm
  assert.equal(ptOfWidthIdx(7), 1.5);
  assert.equal(ptOfWidthIdx(1), 0.5); // 0.12mm → ½ pt
});

test('[lily] 합친 칸이 걸린 행·열 옮기기는 막는다', () => {
  const c = cells(3, 2);
  assert.equal(moveBlocked(c, 'row', 0, 3), false);
  const merged = c.filter((b) => !(b.row === 2 && b.col === 0)).map((b) => (b.row === 1 && b.col === 0 ? { ...b, rowSpan: 2, h: 40 } : b));
  assert.equal(moveBlocked(merged, 'row', 0, 3), true);
  assert.equal(moveBlocked(merged, 'row', 0, 1), false); // 제자리
  assert.equal(moveBlocked(merged, 'col', 0, 2), false);
});
