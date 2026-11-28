// [lily] table.* 덧그림 RPC: 인자 검증 · 표 꼴 계산 · 테두리 변 고르기 · 테두리 상태 · 옮기기 막힘
import test from 'node:test';
import assert from 'node:assert/strict';

import { routeEmbedRequest, type EmbedRpcHandlers } from '../src/embed/rpc-router.ts';
import {
  bandRectsOf, bordersState, columnWidths, framesOf, gridOfCells, laidRowHeights, moveBlocked, pageGridsOf, ptOfWidthIdx, resizedColumns, sidesFor, widthIdxOfPt,
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
  // 선이 그려진 구간: 합치지 않은 표는 선마다 표 높이·폭 전체 한 구간
  assert.deepEqual(g.colSpans, [[[40, 100]], [[40, 100]], [[40, 100]]]);
  assert.deepEqual(g.rowSpans, [[[50, 250]], [[50, 250]], [[50, 250]]]);
  // 가운데 행의 두 칸을 합치면 열 선 1 은 그 행에서 끊기고, 2행 2열 세로 합침은 행 선 0 의 오른쪽 칸을 끊는다
  const m = cells(3, 2).filter((b) => !(b.row === 1 && b.col === 1) && !(b.row === 1 && b.col === 0)).filter((b) => !(b.row === 0 && b.col === 1));
  m.push({ cellIdx: 90, row: 1, col: 0, rowSpan: 1, colSpan: 2, pageIndex: 0, x: 50, y: 60, w: 200, h: 20 });
  m.push({ cellIdx: 91, row: 0, col: 1, rowSpan: 1, colSpan: 1, pageIndex: 0, x: 150, y: 40, w: 100, h: 20 });
  const gm = gridOfCells(m, 2)!;
  assert.deepEqual(gm.colSpans![1], [[40, 60], [80, 100]]);
  const v = cells(3, 2).filter((b) => !(b.col === 1 && b.row < 2));
  v.push({ cellIdx: 92, row: 0, col: 1, rowSpan: 2, colSpan: 1, pageIndex: 0, x: 150, y: 40, w: 100, h: 40 });
  assert.deepEqual(gridOfCells(v, 2)!.rowSpans![0], [[50, 150]]);
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

test('[lily 2] 새 table.* (수 칸 · 경계 끌기 · 표 크기 · 투명 선 · 셀 크기 · 여백 · 글 방향 · 나누기 · 원래대로) 인자 검증', async () => {
  const calls: unknown[] = [];
  const rec = (name: string) => async (r?: unknown) => { calls.push([name, r]); return { ok: true }; };
  const handlers = {
    tableSetCount: rec('setCount'), tableResizeLine: rec('resizeLine'), tableResize: rec('resize'), tableSetGridlines: rec('gridlines'),
    tableSetCellSize: rec('cellSize'), tableSetPadding: rec('padding'), tableSetTextDirection: rec('dir'), tableSplitCells: rec('split'),
    tableResetStyle: rec('reset'), tableSetCellAlign: rec('align'),
  } as unknown as EmbedRpcHandlers;
  const ref = { sec: 0, ppi: 1, ci: 0 };
  await routeEmbedRequest('table.setCount', { ...ref, axis: 'col', n: 5 }, handlers);
  await routeEmbedRequest('table.resizeLine', { ...ref, axis: 'col', line: 1, deltaPx: -12.5 }, handlers);
  await routeEmbedRequest('table.resize', { ...ref, page: 0, widthPx: 300, heightPx: 80 }, handlers);
  await routeEmbedRequest('table.setGridlines', { on: true }, handlers);
  await routeEmbedRequest('table.setCellSize', { rowHeightMm: 10 }, handlers);
  await routeEmbedRequest('table.setPadding', { top: 2, left: 1.8 }, handlers);
  await routeEmbedRequest('table.setTextDirection', { dir: 'vertical' }, handlers);
  await routeEmbedRequest('table.splitCells', { rows: 1, cols: 2, mergeFirst: true }, handlers);
  await routeEmbedRequest('table.resetStyle', {}, handlers);
  await routeEmbedRequest('table.setCellAlign', { v: 'bottom', h: 'right' }, handlers);
  assert.deepEqual(calls, [
    ['setCount', { ...ref, axis: 'col', n: 5 }],
    ['resizeLine', { ...ref, axis: 'col', line: 1, deltaPx: -12.5, mode: 'share' }],
    ['resize', { ...ref, page: 0, widthPx: 300, heightPx: 80 }],
    ['gridlines', { on: true }],
    ['cellSize', { rowHeightMm: 10 }],
    ['padding', { top: 2, left: 1.8 }],
    ['dir', { dir: 'vertical' }],
    ['split', { rows: 1, cols: 2, mergeFirst: true }],
    ['reset', undefined],
    ['align', { v: 'bottom', h: 'right' }],
  ]);
  await assert.rejects(routeEmbedRequest('table.setCount', { ...ref, axis: 'col', n: 0 }, handlers));
  await assert.rejects(routeEmbedRequest('table.setCount', { ...ref, axis: 'col', n: 64 }, handlers));
  await assert.rejects(routeEmbedRequest('table.resizeLine', { ...ref, axis: 'col', line: 1, deltaPx: 3, mode: 'grow' }, handlers));
  await assert.rejects(routeEmbedRequest('table.resize', { ...ref, page: 0, widthPx: 0, heightPx: 10 }, handlers));
  await assert.rejects(routeEmbedRequest('table.setCellSize', {}, handlers));
  await assert.rejects(routeEmbedRequest('table.setPadding', { top: -1 }, handlers));
  await assert.rejects(routeEmbedRequest('table.setCellAlign', { h: 'middle' }, handlers));
  await assert.rejects(routeEmbedRequest('table.setCellAlign', {}, handlers));
});

test('[lily 2] 열 경계 끌기: 이웃이 메움(표 너비 그대로) · 왼쪽 열만 · 비율 · 하한', () => {
  const cols = [3000, 3000, 3000];
  assert.deepEqual(resizedColumns(cols, 1, 750, 'share'), [3750, 2250, 3000]);
  assert.deepEqual(resizedColumns(cols, 1, 750, 'left'), [3750, 3000, 3000]);
  const ratio = resizedColumns(cols, 1, 600, 'ratio')!;
  assert.equal(ratio[0], 3600);
  assert.equal(Math.round(ratio[1]! + ratio[2]!), 5400);
  // 오른쪽 끝 경계 = 늘 왼쪽 열만
  assert.deepEqual(resizedColumns(cols, 3, -500, 'share'), [3000, 3000, 2500]);
  // 하한 6pt(600): 이웃을 600 아래로 줄이지 않는다
  assert.deepEqual(resizedColumns(cols, 1, 9999, 'share'), [5400, 600, 3000]);
  assert.deepEqual(resizedColumns(cols, 1, -9999, 'share'), [600, 5400, 3000]);
  assert.equal(resizedColumns(cols, 0, 10, 'share'), null);
});

test('[lily 2] 열 너비 · 그려진 행 높이 · 쪽마다 꼴', () => {
  const c = cells(3, 2);
  assert.deepEqual(columnWidths(c, 2, (b) => b.w * 75), [7500, 7500]);
  const merged = [{ cellIdx: 0, row: 0, col: 0, rowSpan: 1, colSpan: 2, pageIndex: 0, x: 0, y: 0, w: 200, h: 20 }];
  assert.deepEqual(columnWidths(merged, 2, () => 15000), [7500, 7500]);
  assert.deepEqual(laidRowHeights(c, 3), [20, 20, 20]);
  // 행 1 이 두 쪽에 걸쳤다: 조각을 더한다
  const split = [...cells(2, 1), { cellIdx: 1, row: 1, col: 0, rowSpan: 1, colSpan: 1, pageIndex: 1, x: 50, y: 40, w: 100, h: 15 }];
  assert.deepEqual(laidRowHeights(split, 2), [20, 35]);
  const info = { getPageInfo: (p: number) => ({ width: 794, height: 1123, marginLeft: 56 + p, marginRight: 56, bodyLeft: 57, bodyRight: 737 }) };
  const two = [...cells(1, 2, 0), ...cells(1, 2, 1).map((b) => ({ ...b, cellIdx: b.cellIdx + 2, row: 1 }))];
  const g = pageGridsOf(info as never, two, 2, 2);
  assert.equal(g.length, 2);
  assert.deepEqual([g[0]!.first, g[0]!.last, g[1]!.first, g[1]!.last], [true, false, false, true]);
  assert.deepEqual([g[0]!.bodyLeft, g[0]!.bodyRight, g[0]!.pageWidth], [57, 737, 794]);
});

test('[lily 3] 표 스타일: 카드 + 옵션 → 칸 꼴(lily-docs 견본과 같은 차례) · 빠진 부분 기본 · 표지 왕복', async () => {
  const { cellLook, effectiveCard, descriptionOfStyle, styleOfDescription, LILY_TABLE_GRID, HEADER_ONLY, parseStyle } = await import('../src/embed/table-style-ops.ts');
  const lily = { card: LILY_TABLE_GRID, look: HEADER_ONLY };
  // 새 표 = 제목 행만: 첫 행 F2F2F2 + 굵게, 나머지 바탕 없음, 모든 변 검정
  const blk = { type: 1, color: '000000' };
  assert.deepEqual(cellLook(lily, 0, 1, 1, 1, 4, 3), { fill: 'F2F2F2', bold: true, color: null, top: blk, bottom: blk, left: blk, right: blk });
  assert.deepEqual(cellLook(lily, 2, 1, 1, 1, 4, 3), { fill: null, bold: false, color: null, top: blk, bottom: blk, left: blk, right: blk });
  // 요약 행 · 줄무늬 행: 끝 행 굵게 + 위 이중선(바로 위 행 아래도), 줄무늬는 제목 행 다음부터 하나 걸러
  const all = { card: LILY_TABLE_GRID, look: { ...HEADER_ONLY, totalRow: true, bandedRows: true } };
  assert.equal(cellLook(all, 1, 1, 1, 1, 5, 3).fill, 'F5F5F5');
  assert.equal(cellLook(all, 2, 1, 1, 1, 5, 3).fill, null);
  assert.deepEqual([cellLook(all, 4, 1, 1, 1, 5, 3).bold, cellLook(all, 4, 1, 1, 1, 5, 3).top.type, cellLook(all, 3, 1, 1, 1, 5, 3).bottom.type], [true, 8, 8]);
  // 줄무늬 행이 줄무늬 열보다 앞선다 · 요약 행에도 줄무늬 열
  const both = { card: LILY_TABLE_GRID, look: { ...HEADER_ONLY, totalRow: true, bandedRows: true, bandedColumns: true } };
  assert.equal(cellLook({ ...both, card: { ...LILY_TABLE_GRID, band: 'AAAAAA', bandCol: 'BBBBBB' } }, 1, 0, 1, 1, 5, 3).fill, 'AAAAAA');
  assert.equal(cellLook({ ...both, card: { ...LILY_TABLE_GRID, band: 'AAAAAA', bandCol: 'BBBBBB' } }, 4, 0, 1, 1, 5, 3).fill, 'BBBBBB');
  // List Table 3: 바깥 테두리만, 요약 행 위 = 카드 색 실선 / 요약 행 선이 없는 카드에 켜면 검정 이중선
  const list = { card: { id: 'ListTable3AccentBlue', border: '156082', header: '156082', headerBold: true, totalRule: true, outerOnly: true }, look: { ...HEADER_ONLY, totalRow: true } };
  assert.deepEqual([cellLook(list, 1, 1, 1, 1, 4, 3).left.type, cellLook(list, 1, 0, 1, 1, 4, 3).left.type, cellLook(list, 3, 1, 1, 1, 4, 3).top], [0, 1, { type: 1, color: '156082' }]);
  assert.deepEqual(cellLook({ card: { id: 'GridTable4AccentBlue', border: 'C1E4F5' }, look: { ...HEADER_ONLY, totalRow: true } }, 3, 1, 1, 1, 4, 3).top, { type: 8, color: '000000' });
  // 제목 행 글자 색 · 카드 테두리 색(Grid Table 4 Accent Blue)
  const blue = { card: { id: 'GridTable4AccentBlue', header: '156082', headerBold: true, headerColor: 'FFFFFF', band: 'C1E4F5', border: 'C1E4F5', firstColBold: true }, look: { ...HEADER_ONLY, bandedRows: true } };
  const lb = { type: 1, color: 'C1E4F5' };
  assert.deepEqual(cellLook(blue, 0, 0, 1, 1, 3, 3), { fill: '156082', bold: true, color: 'FFFFFF', top: lb, bottom: lb, left: lb, right: lb });
  // 카드에 없는 부분을 켜면 기본(Table Grid + 제목 행 = F2F2F2 굵게)
  assert.deepEqual(effectiveCard({ id: 'TableGrid' }, HEADER_ONLY), { id: 'TableGrid', header: 'F2F2F2', headerBold: true });
  // 스타일 없음 = 꾸밈 · 테두리 없음
  assert.equal(cellLook({ card: null, look: HEADER_ONLY }, 0, 0, 1, 1, 2, 2).top.type, 0);
  // 설명문 표지 왕복 · 남의 설명문은 무시
  assert.deepEqual(styleOfDescription(descriptionOfStyle(blue)), parseStyle(blue));
  assert.equal(styleOfDescription('개체 설명'), null);
  assert.throws(() => parseStyle({ card: { id: 'x', header: 'red' }, look: HEADER_ONLY }));
});
