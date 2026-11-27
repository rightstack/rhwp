/**
 * [lily] 호스트가 그리는 표 덧그림·도구 줄의 embed RPC(table.gridAt · state · bandRects · select · insertAt · deleteLines ·
 * move · setBorders · setCellAlign · setHeaderRow, 2026-11-27).
 *
 * LilyOffice 에이치독스가 lily-docs 와 같은 표 기능(가장자리 삽입 표시 · 행/열 알약 손잡이 · 끌어서 옮기기 · 표 아래 도구 줄 ·
 * 셀 서식 패널)을 studio 문서 위 덧그림으로 그린다. 덧그림은 studio 의 표 꼴을 다시 계산하지 않고 여기서 쪽 좌표(확대 1 의 px,
 * 셀 블록 하이라이트와 같은 좌표)로 묻는다. 바꾸는 일은 모두 snapshot 하나 = 실행 취소 한 단계이고, 대화 상자와 같은 wasm 함수
 * (insertTableRow · deleteTableRow · setCellProperties · setTableProperties)를 부른다. 행·열 옮기기만 새 wasm 함수
 * (moveTableRow · moveTableColumn — 칸을 통째로 옮긴다, 합친 칸이 걸리면 거절)다.
 *
 * 셀 블록 고르기는 F5·끌기와 같은 상태(CursorState 셀 선택 모드)를 세운다 — 글자 모양 · 칸 배경 · 서식 줄이 그대로 그 블록에 듣는다.
 * 중첩 표(칸 안의 표)·글상자 안 표는 다루지 않는다(맨 바깥 표만).
 */
import type { InputHandler } from '../engine/input-handler.ts';
import type { WasmBridge } from '../core/wasm-bridge.ts';
import type { CellBbox, DocumentPosition } from '../core/types.ts';

export interface EmbedTableRefV1 { sec: number; ppi: number; ci: number }
/** 쪽 위 사각형 [쪽, x, y, w, h] — 쪽 좌표(확대 1 의 px) */
export type EmbedPageRectV1 = [number, number, number, number, number];

/** 포인터 아래 표의 꼴(그 쪽에 그려진 조각) — 호스트 공용 TableGridLike 와 같은 모양 + 표 참조 */
export interface EmbedTableGridV1 {
  ref: EmbedTableRefV1;
  page: number;
  /** 쪽 폭(px) — 호스트가 화면 배율을 구한다 */
  pageWidth: number;
  rows: number;
  cols: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** 포인터 아래 칸 [x, y, w, h] 와 그 칸의 행·열 */
  cell: [number, number, number, number];
  cellRow: number;
  cellCol: number;
  colLines: number[];
  rowBands: { row: number; top: number; bottom: number }[];
  /** 첫 행이 이 쪽에 있다 */
  first: boolean;
}

export interface EmbedTableBordersV1 {
  top: boolean | null;
  bottom: boolean | null;
  left: boolean | null;
  right: boolean | null;
  insideH: boolean | null;
  insideV: boolean | null;
  /** 고른 칸 수 [행, 열] */
  span: [number, number];
  /** 보이는 선이 모두 같을 때만: 공용 선 모양 이름 · 굵기(pt) · 색 #rrggbb */
  style: string | null;
  widthPt: number | null;
  color: string | null;
}

export interface EmbedTableStateV1 {
  ref: EmbedTableRefV1;
  rows: number;
  cols: number;
  caret: { row: number; col: number } | null;
  /** 셀 블록(F5 · 끌기 · table.select). wholeRows = 고른 행이 처음부터 끝 열까지 */
  sel: { r0: number; c0: number; r1: number; c1: number; wholeRows: boolean; wholeCols: boolean; table: boolean } | null;
  /** 표 개체 선택(studio 의 표 틀 · 크기 손잡이) */
  objectSelected: boolean;
  /** 고른 칸들(없으면 캐럿 칸)의 쪽별 바깥 틀 */
  selFrames: EmbedPageRectV1[];
  /** 표의 쪽별 바깥 틀 */
  tableFrames: EmbedPageRectV1[];
  /** 위 틀이 걸친 쪽의 폭(px) */
  pageWidths: Record<number, number>;
  /** 캐럿 칸 바탕색 #rrggbb(없으면 null) · 세로 맞춤 */
  fill: string | null;
  vAlign: 'top' | 'center' | 'bottom';
  borders: EmbedTableBordersV1;
  /** 제목 줄: 첫 행 칸이 모두 제목 칸이고 표가 제목 줄을 자동 반복한다 */
  headerRow: boolean;
}

// ── 순수 계산(테스트 가능) ──

const spanEnd = (start: number, span: number) => start + Math.max(1, span) - 1;
const overlaps = (b: CellBbox, r0: number, c0: number, r1: number, c1: number) =>
  b.row <= r1 && spanEnd(b.row, b.rowSpan) >= r0 && b.col <= c1 && spanEnd(b.col, b.colSpan) >= c0;

/** 한 쪽에 그려진 칸들 → 열 경계(열 + 1개) · 행 띠 · 바깥 틀 */
export function gridOfCells(cells: readonly CellBbox[], cols: number): Pick<EmbedTableGridV1, 'left' | 'top' | 'right' | 'bottom' | 'colLines' | 'rowBands' | 'first'> | null {
  if (!cells.length) return null;
  const left = Math.min(...cells.map((b) => b.x));
  const top = Math.min(...cells.map((b) => b.y));
  const right = Math.max(...cells.map((b) => b.x + b.w));
  const bottom = Math.max(...cells.map((b) => b.y + b.h));
  const lines: (number | null)[] = [];
  for (let c = 0; c <= cols; c += 1) {
    const starts = cells.filter((b) => b.col === c).map((b) => b.x);
    const ends = cells.filter((b) => b.col + Math.max(1, b.colSpan) === c).map((b) => b.x + b.w);
    lines.push(starts.length ? Math.min(...starts) : ends.length ? Math.max(...ends) : null);
  }
  lines[0] = lines[0] ?? left;
  lines[cols] = lines[cols] ?? right;
  // 모두 합친 열의 경계: 앞뒤 경계 사이를 고르게
  for (let c = 1; c < cols; c += 1) {
    if (lines[c] !== null) continue;
    let n = c + 1;
    while (lines[n] === null) n += 1;
    const a = lines[c - 1]!, b = lines[n]!;
    lines[c] = a + (b - a) / (n - c + 1);
  }
  const rows = [...new Set(cells.map((b) => b.row))].sort((a, b) => a - b);
  const rowBands = rows.map((row, i) => {
    const own = cells.filter((b) => b.row === row);
    const rTop = Math.min(...own.map((b) => b.y));
    const single = own.filter((b) => Math.max(1, b.rowSpan) === 1).map((b) => b.y + b.h);
    const next = rows[i + 1] !== undefined ? Math.min(...cells.filter((b) => b.row === rows[i + 1]).map((b) => b.y)) : null;
    const rBottom = single.length ? Math.min(...single) : next ?? Math.max(...own.map((b) => b.y + b.h));
    return { row, top: rTop, bottom: rBottom };
  });
  return { left, top, right, bottom, colLines: lines as number[], rowBands, first: rows[0] === 0 };
}

/** 칸들 → 쪽별 바깥 틀 */
export function framesOf(cells: readonly CellBbox[]): EmbedPageRectV1[] {
  const by = new Map<number, [number, number, number, number]>();
  for (const b of cells) {
    const f = by.get(b.pageIndex);
    by.set(b.pageIndex, f ? [Math.min(f[0], b.x), Math.min(f[1], b.y), Math.max(f[2], b.x + b.w), Math.max(f[3], b.y + b.h)] : [b.x, b.y, b.x + b.w, b.y + b.h]);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([p, [l, t, r, bt]]) => [p, l, t, r - l, bt - t]);
}

/** 행(axis row)·열 구간 [from, to] 의 쪽별 사각형 — 넣은·옮긴 줄 깜빡임 */
export function bandRectsOf(cells: readonly CellBbox[], axis: 'row' | 'col', from: number, to: number): EmbedPageRectV1[] {
  const hit = cells.filter((b) => (axis === 'row'
    ? b.row <= to && spanEnd(b.row, b.rowSpan) >= from && Math.max(1, b.rowSpan) === 1
    : b.col <= to && spanEnd(b.col, b.colSpan) >= from && Math.max(1, b.colSpan) === 1));
  return framesOf(hit.length ? hit : cells.filter((b) => (axis === 'row' ? b.row <= to && spanEnd(b.row, b.rowSpan) >= from : b.col <= to && spanEnd(b.col, b.colSpan) >= from)));
}

/** 옮기는 줄부터 놓일 자리까지 사이에 그 방향으로 합친 칸이 있나 */
export function moveBlocked(cells: readonly CellBbox[], axis: 'row' | 'col', from: number, line: number): boolean {
  const to = line > from ? line - 1 : line;
  const [lo, hi] = [Math.min(from, to), Math.max(from, to)];
  return cells.some((b) => (axis === 'row'
    ? Math.max(1, b.rowSpan) > 1 && b.row <= hi && spanEnd(b.row, b.rowSpan) >= lo
    : Math.max(1, b.colSpan) > 1 && b.col <= hi && spanEnd(b.col, b.colSpan) >= lo));
}

/** HWP 선 굵기 번호 → mm(한글 테두리 굵기 표) */
export const HWP_LINE_WIDTH_MM = [0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0] as const;
const MM_PER_PT = 25.4 / 72;
export const widthIdxOfPt = (pt: number): number => {
  const mm = pt * MM_PER_PT;
  let best = 0;
  HWP_LINE_WIDTH_MM.forEach((w, i) => { if (Math.abs(w - mm) < Math.abs(HWP_LINE_WIDTH_MM[best]! - mm)) best = i; });
  return best;
};
/** 번호 → pt(공용 굵기 여섯 중 가장 가까운 것) */
const UI_WIDTHS_PT = [0.5, 0.75, 1, 1.5, 2.25, 3];
export const ptOfWidthIdx = (idx: number): number => {
  const mm = HWP_LINE_WIDTH_MM[Math.max(0, Math.min(HWP_LINE_WIDTH_MM.length - 1, idx))]!;
  return UI_WIDTHS_PT.reduce((a, b) => (Math.abs(b * MM_PER_PT - mm) < Math.abs(a * MM_PER_PT - mm) ? b : a));
};
/** 공용 선 모양 이름 ↔ HWP 선 종류(0 없음 · 1 실선 · 2 파선 · 3 점선 · 4 일점 쇄선 · 8 이중선 · 11 삼중선 · 12 물결) */
export const BORDER_TYPE_OF: Record<string, number> = { single: 1, dashed: 2, dotted: 3, dotDash: 4, double: 8, triple: 11, wave: 12 };
export const styleOfBorderType = (t: number): string => Object.entries(BORDER_TYPE_OF).find(([, v]) => v === t)?.[0] ?? 'single';

export type EmbedBorderKindV1 = 'all' | 'outside' | 'inside' | 'none' | 'top' | 'bottom' | 'left' | 'right';
type Side = 'top' | 'bottom' | 'left' | 'right';
const SIDE_KEY: Record<Side, 'borderTop' | 'borderBottom' | 'borderLeft' | 'borderRight'> = { top: 'borderTop', bottom: 'borderBottom', left: 'borderLeft', right: 'borderRight' };

/** 범위 [r0..r1]×[c0..c1] 안의 칸 하나에서 테두리 종류가 건드리는 변 */
export function sidesFor(kind: EmbedBorderKindV1, b: Pick<CellBbox, 'row' | 'col' | 'rowSpan' | 'colSpan'>, r: { r0: number; c0: number; r1: number; c1: number }): Side[] {
  const outer: Record<Side, boolean> = {
    top: b.row <= r.r0, bottom: spanEnd(b.row, b.rowSpan) >= r.r1, left: b.col <= r.c0, right: spanEnd(b.col, b.colSpan) >= r.c1,
  };
  return (['top', 'bottom', 'left', 'right'] as const).filter((s) => {
    if (kind === 'all' || kind === 'none') return true;
    if (kind === 'outside') return outer[s];
    if (kind === 'inside') return !outer[s];
    return kind === s && outer[s];
  });
}

interface Line { type: number; width: number; color: string }
/** 고른 칸들의 테두리 상태(공용 TableBordersLike 꼴) */
export function bordersState(cells: { b: CellBbox; lines: Record<Side, Line> }[], r: { r0: number; c0: number; r1: number; c1: number }): EmbedTableBordersV1 {
  const acc: Record<'top' | 'bottom' | 'left' | 'right' | 'insideH' | 'insideV', boolean[]> = { top: [], bottom: [], left: [], right: [], insideH: [], insideV: [] };
  const seen: Line[] = [];
  for (const { b, lines } of cells) {
    for (const s of ['top', 'bottom', 'left', 'right'] as const) {
      const on = lines[s].type !== 0;
      if (on) seen.push(lines[s]);
      const outer = sidesFor(s, b, r).includes(s);
      if (outer) acc[s].push(on);
      else acc[s === 'top' || s === 'bottom' ? 'insideH' : 'insideV'].push(on);
    }
  }
  const fold = (xs: boolean[]): boolean | null => (xs.length === 0 ? false : xs.every(Boolean) ? true : xs.every((x) => !x) ? false : null);
  const same = <T,>(f: (l: Line) => T): T | null => (seen.length && seen.every((l) => f(l) === f(seen[0]!)) ? f(seen[0]!) : null);
  const type = same((l) => l.type);
  const width = same((l) => l.width);
  return {
    top: fold(acc.top), bottom: fold(acc.bottom), left: fold(acc.left), right: fold(acc.right), insideH: fold(acc.insideH), insideV: fold(acc.insideV),
    span: [r.r1 - r.r0 + 1, r.c1 - r.c0 + 1],
    style: type === null ? null : styleOfBorderType(type),
    widthPt: width === null ? null : ptOfWidthIdx(width),
    color: same((l) => l.color.toLowerCase()),
  };
}

// ── 인자 검증 ──

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, name: string, min = 0, max = 1_000_000): number => {
  if (!Number.isSafeInteger(v) || (v as number) < min || (v as number) > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return v as number;
};
const num = (v: unknown, name: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number`);
  return v;
};
const axisOf = (v: unknown): 'row' | 'col' => {
  if (v !== 'row' && v !== 'col') throw new Error('axis must be row or col');
  return v;
};
const COLOR = /^#[0-9a-fA-F]{6}$/;

export function parseTableRef(p: Record<string, unknown>): EmbedTableRefV1 {
  return { sec: int(p.sec, 'sec'), ppi: int(p.ppi, 'ppi'), ci: int(p.ci, 'ci') };
}
/** 쪽 안 자리는 쪽 폭·높이에 대한 비율(0–1, 밖이면 넘어도 된다) — 호스트는 쪽 캔버스 상자만 알면 된다 */
export function parseGridAt(p: Record<string, unknown>): { page: number; fx: number; fy: number } {
  return { page: int(p.page, 'page'), fx: num(p.fx, 'fx'), fy: num(p.fy, 'fy') };
}
export function parseBandRects(p: Record<string, unknown>): EmbedTableRefV1 & { axis: 'row' | 'col'; from: number; to: number } {
  const from = int(p.from, 'from', 0, 65535);
  const to = int(p.to, 'to', 0, 65535);
  if (to < from) throw new Error('to must not be less than from');
  return { ...parseTableRef(p), axis: axisOf(p.axis), from, to };
}
export function parseSelect(p: Record<string, unknown>): EmbedTableRefV1 & { r0: number; c0: number; r1: number; c1: number } {
  const [r0, c0, r1, c1] = (['r0', 'c0', 'r1', 'c1'] as const).map((k) => int(p[k], k, 0, 65535)) as [number, number, number, number];
  if (r1 < r0 || c1 < c0) throw new Error('r1/c1 must not be less than r0/c0');
  return { ...parseTableRef(p), r0, c0, r1, c1 };
}
export function parseInsertAt(p: Record<string, unknown>): EmbedTableRefV1 & { axis: 'row' | 'col'; line: number } {
  return { ...parseTableRef(p), axis: axisOf(p.axis), line: int(p.line, 'line', 0, 65535) };
}
export function parseMove(p: Record<string, unknown>): EmbedTableRefV1 & { axis: 'row' | 'col'; from: number; line: number } {
  return { ...parseTableRef(p), axis: axisOf(p.axis), from: int(p.from, 'from', 0, 65535), line: int(p.line, 'line', 0, 65535) };
}
export function parseDeleteLines(p: Record<string, unknown>): { what: 'rows' | 'cols' | 'table' } {
  if (p.what !== 'rows' && p.what !== 'cols' && p.what !== 'table') throw new Error('what must be rows, cols or table');
  return { what: p.what };
}
export interface EmbedSetBordersV1 { kind: EmbedBorderKindV1 | 'restyle'; on?: boolean; style?: string; widthPt?: number; color?: string | null }
export function parseSetBorders(p: Record<string, unknown>): EmbedSetBordersV1 {
  const kinds = ['all', 'outside', 'inside', 'none', 'top', 'bottom', 'left', 'right', 'restyle'];
  if (typeof p.kind !== 'string' || !kinds.includes(p.kind)) throw new Error(`kind must be one of ${kinds.join(', ')}`);
  const out: EmbedSetBordersV1 = { kind: p.kind as EmbedSetBordersV1['kind'] };
  if (p.on !== undefined) {
    if (typeof p.on !== 'boolean') throw new Error('on must be true or false');
    out.on = p.on;
  }
  if (p.style !== undefined) {
    if (typeof p.style !== 'string' || !(p.style in BORDER_TYPE_OF) && p.style !== 'thick') throw new Error(`style must be one of ${Object.keys(BORDER_TYPE_OF).join(', ')}`);
    out.style = p.style === 'thick' ? 'single' : p.style;
  }
  if (p.widthPt !== undefined) {
    if (typeof p.widthPt !== 'number' || !(p.widthPt > 0 && p.widthPt <= 20)) throw new Error('widthPt must be a number from 0 to 20');
    out.widthPt = p.widthPt;
  }
  if (p.color !== undefined) {
    if (p.color !== null && (typeof p.color !== 'string' || !COLOR.test(p.color))) throw new Error('color must be #rrggbb or null');
    out.color = p.color === null ? null : (p.color as string).toLowerCase();
  }
  return out;
}
export function parseCellAlign(p: Record<string, unknown>): { v: 'top' | 'center' | 'bottom' } {
  if (p.v !== 'top' && p.v !== 'center' && p.v !== 'bottom') throw new Error('v must be top, center or bottom');
  return { v: p.v };
}
export function parseHeaderRow(p: Record<string, unknown>): { on: boolean } {
  if (typeof p.on !== 'boolean') throw new Error('on must be true or false');
  return { on: p.on };
}
export const asRecord = (v: unknown): Record<string, unknown> => (isRecord(v) ? v : {});

// ── studio 에 잇기 ──

/** InputHandler 의 셀 블록 고르기에 쓰는 내부(F5 · 끌기 길과 같은 순서로 부른다 — upstream 파일을 바꾸지 않으려고 여기서만 본다) */
interface IhInternals {
  cursor: {
    clearSelection(): void;
    moveTo(pos: DocumentPosition): void;
    resetPreferredX(): void;
    enterCellSelectionMode(): boolean;
    setCellSelectionAnchor(row: number, col: number): void;
    setCellSelectionFocus(row: number, col: number): void;
    exitTableObjectSelection(): void;
  };
  caret: { hide(): void };
  fieldMarker?: { hide(): void };
  selectionRenderer: { clear(): void };
  tableObjectRenderer?: { clear(): void } | null;
  eventBus: { emit(name: string, ...args: unknown[]): void };
  textarea?: HTMLTextAreaElement;
  active: boolean;
  updateCellSelection(): void;
  exitPictureObjectSelectionIfNeeded?(): void;
}
interface RawDoc { moveTableRow(sec: number, ppi: number, ci: number, from: number, line: number): string; moveTableColumn(sec: number, ppi: number, ci: number, from: number, line: number): string }

const V_ALIGN = ['top', 'center', 'bottom'] as const;

function cellsOf(wasm: WasmBridge, ref: EmbedTableRefV1, pageHint?: number): CellBbox[] {
  try {
    return wasm.getTableCellBboxes(ref.sec, ref.ppi, ref.ci, pageHint);
  } catch {
    return [];
  }
}
const cellPos = (ref: EmbedTableRefV1, cellIdx: number): DocumentPosition => ({
  sectionIndex: ref.sec, paragraphIndex: 0, charOffset: 0, parentParaIndex: ref.ppi, controlIndex: ref.ci, cellIndex: cellIdx, cellParaIndex: 0,
});
const cellAt = (cells: readonly CellBbox[], row: number, col: number) =>
  cells.find((b) => row >= b.row && row <= spanEnd(b.row, b.rowSpan) && col >= b.col && col <= spanEnd(b.col, b.colSpan));

function dims(wasm: WasmBridge, ref: EmbedTableRefV1): { rows: number; cols: number } | null {
  try {
    const d = wasm.getTableDimensions(ref.sec, ref.ppi, ref.ci);
    return { rows: d.rowCount, cols: d.colCount };
  } catch {
    return null;
  }
}

/** 쪽 점(쪽 폭·높이 비율) 아래 표의 꼴. 표 칸 위가 아니면 null */
export function tableGridAt(wasm: WasmBridge, at: { page: number; fx: number; fy: number }): EmbedTableGridV1 | null {
  if (at.page >= wasm.pageCount) return null;
  let info;
  try { info = wasm.getPageInfo(at.page); } catch { return null; }
  const req = { page: at.page, x: at.fx * info.width, y: at.fy * info.height };
  let hit;
  try { hit = wasm.hitTest(req.page, req.x, req.y); } catch { return null; }
  if (hit.parentParaIndex === undefined || hit.controlIndex === undefined || hit.isTextBox) return null;
  const outer = hit.cellPath?.[0];
  const ref = { sec: hit.sectionIndex, ppi: hit.parentParaIndex, ci: outer?.controlIndex ?? hit.controlIndex };
  const d = dims(wasm, ref);
  if (!d) return null;
  const onPage = cellsOf(wasm, ref, req.page).filter((b) => b.pageIndex === req.page);
  const cell = onPage.find((b) => req.x >= b.x && req.x <= b.x + b.w && req.y >= b.y && req.y <= b.y + b.h);
  const g = gridOfCells(onPage, d.cols);
  if (!cell || !g) return null;
  return { ref, page: req.page, pageWidth: info.width, rows: d.rows, cols: d.cols, ...g, cell: [cell.x, cell.y, cell.w, cell.h], cellRow: cell.row, cellCol: cell.col };
}

/** 캐럿·셀 블록·표 개체 선택이 있는 표(맨 바깥 표만) */
function currentTable(ih: InputHandler): { ref: EmbedTableRefV1; object: boolean } | null {
  if (ih.isInTableObjectSelection()) {
    const r = ih.getSelectedTableRef();
    return r && !(r.cellPath && r.cellPath.length > 1) ? { ref: { sec: r.sec, ppi: r.ppi, ci: r.ci }, object: true } : null;
  }
  const ctx = ih.isInCellSelectionMode() ? ih.getCellTableContext() : null;
  if (ctx) return ctx.cellPath && ctx.cellPath.length > 1 ? null : { ref: { sec: ctx.sec, ppi: ctx.ppi, ci: ctx.ci }, object: false };
  const pos = ih.getCursorPosition();
  if (pos.parentParaIndex === undefined || pos.controlIndex === undefined || pos.cellIndex === undefined) return null;
  if (pos.cellPath && pos.cellPath.length > 1) return null;
  return { ref: { sec: pos.sectionIndex, ppi: pos.parentParaIndex, ci: pos.controlIndex }, object: false };
}

/** 지금 고른 범위(셀 블록, 없으면 캐럿 칸) */
function currentRange(ih: InputHandler, cells: readonly CellBbox[]): { r0: number; c0: number; r1: number; c1: number; block: boolean } | null {
  const range = ih.isInCellSelectionMode() ? ih.getSelectedCellRange() : null;
  if (range) return { r0: range.startRow, c0: range.startCol, r1: range.endRow, c1: range.endCol, block: true };
  const pos = ih.getCursorPosition();
  const b = cells.find((c) => c.cellIdx === pos.cellIndex);
  return b ? { r0: b.row, c0: b.col, r1: spanEnd(b.row, b.rowSpan), c1: spanEnd(b.col, b.colSpan), block: false } : null;
}

const dedupe = (cells: readonly CellBbox[]) => {
  const seen = new Set<number>();
  return cells.filter((b) => (seen.has(b.cellIdx) ? false : (seen.add(b.cellIdx), true)));
};

/** 표 상태(도구 줄 · 패널 · 손잡이) */
export function tableState(ih: InputHandler, wasm: WasmBridge): EmbedTableStateV1 | null {
  const cur = currentTable(ih);
  if (!cur) return null;
  const { ref } = cur;
  const d = dims(wasm, ref);
  const cells = cellsOf(wasm, ref);
  if (!d || !cells.length) return null;
  const uniq = dedupe(cells);
  const pos = ih.getCursorPosition();
  const caretCell = cur.object ? undefined : uniq.find((b) => b.cellIdx === pos.cellIndex);
  const r = cur.object ? { r0: 0, c0: 0, r1: d.rows - 1, c1: d.cols - 1, block: false } : currentRange(ih, uniq);
  const sel = r && r.block
    ? { r0: r.r0, c0: r.c0, r1: r.r1, c1: r.c1, wholeRows: r.c0 === 0 && r.c1 === d.cols - 1, wholeCols: r.r0 === 0 && r.r1 === d.rows - 1, table: false }
    : null;
  if (sel) sel.table = sel.wholeRows && sel.wholeCols;
  const inRange = r ? cells.filter((b) => overlaps(b, r.r0, r.c0, r.r1, r.c1)) : [];
  const pageWidths: Record<number, number> = {};
  for (const p of new Set(cells.map((b) => b.pageIndex))) {
    try { pageWidths[p] = wasm.getPageInfo(p).width; } catch { /* 모름 */ }
  }
  // 칸 속성(바탕 · 세로 맞춤 · 테두리)
  const props = new Map<number, ReturnType<WasmBridge['getCellProperties']>>();
  const propOf = (idx: number) => {
    if (!props.has(idx)) { try { props.set(idx, wasm.getCellProperties(ref.sec, ref.ppi, ref.ci, idx)); } catch { /* 없음 */ } }
    return props.get(idx);
  };
  const focus = caretCell ?? (r ? cellAt(uniq, r.r0, r.c0) : undefined);
  const fp = focus ? propOf(focus.cellIdx) : undefined;
  const fill = fp && fp.fillType === 'solid' && typeof fp.fillColor === 'string' && COLOR.test(fp.fillColor) ? fp.fillColor.toLowerCase() : null;
  const none: Line = { type: 0, width: 0, color: '#000000' };
  const lineOf = (v: unknown): Line => (isRecord(v) && typeof v.type === 'number' ? { type: v.type, width: Number(v.width) || 0, color: String(v.color ?? '#000000') } : none);
  const borderCells = r ? dedupe(inRange).map((b) => {
    const p = propOf(b.cellIdx);
    return { b, lines: { top: lineOf(p?.borderTop), bottom: lineOf(p?.borderBottom), left: lineOf(p?.borderLeft), right: lineOf(p?.borderRight) } };
  }) : [];
  const borders = r ? bordersState(borderCells, r) : bordersState([], { r0: 0, c0: 0, r1: 0, c1: 0 });
  let headerRow = false;
  try {
    const tp = wasm.getTableProperties(ref.sec, ref.ppi, ref.ci);
    headerRow = !!tp.repeatHeader && uniq.filter((b) => b.row === 0).every((b) => propOf(b.cellIdx)?.isHeader);
  } catch { /* 모름 */ }
  return {
    ref, rows: d.rows, cols: d.cols,
    caret: caretCell ? { row: caretCell.row, col: caretCell.col } : null,
    sel, objectSelected: cur.object,
    selFrames: framesOf(inRange), tableFrames: framesOf(cells), pageWidths,
    fill, vAlign: V_ALIGN[fp?.verticalAlign ?? 0] ?? 'top', borders, headerRow,
  };
}

export function tableBandRects(wasm: WasmBridge, req: EmbedTableRefV1 & { axis: 'row' | 'col'; from: number; to: number }): EmbedPageRectV1[] {
  return bandRectsOf(cellsOf(wasm, req), req.axis, req.from, req.to);
}

/** 셀 블록을 세운다(F5 · 끌기와 같은 상태) */
function selectBlock(ih: InputHandler, wasm: WasmBridge, ref: EmbedTableRefV1, r0: number, c0: number, r1: number, c1: number): boolean {
  const L = ih as unknown as IhInternals;
  const d = dims(wasm, ref);
  if (!d || r1 >= d.rows || c1 >= d.cols) return false;
  const anchor = cellAt(cellsOf(wasm, ref), r0, c0);
  if (!anchor) return false;
  if (ih.isInTableObjectSelection()) {
    L.cursor.exitTableObjectSelection();
    L.tableObjectRenderer?.clear();
    L.eventBus.emit('table-object-selection-changed', false);
  }
  L.exitPictureObjectSelectionIfNeeded?.();
  if (ih.isInCellSelectionMode()) ih.exitCellSelectionMode();
  L.cursor.clearSelection();
  L.cursor.moveTo(cellPos(ref, anchor.cellIdx));
  L.cursor.resetPreferredX();
  if (!L.cursor.enterCellSelectionMode()) return false;
  L.cursor.setCellSelectionAnchor(r0, c0);
  L.cursor.setCellSelectionFocus(r1, c1);
  L.active = true;
  L.caret.hide();
  L.fieldMarker?.hide();
  L.selectionRenderer.clear();
  L.updateCellSelection();
  L.eventBus.emit('command-state-changed');
  L.textarea?.focus();
  return true;
}

export function tableSelect(ih: InputHandler, wasm: WasmBridge, req: EmbedTableRefV1 & { r0: number; c0: number; r1: number; c1: number }): { ok: boolean } {
  return { ok: selectBlock(ih, wasm, req, req.r0, req.c0, req.r1, req.c1) };
}

/** 첫 행 칸 너비의 합(HWPUNIT) — 열을 넣기 전후 표 너비 */
function rowWidth(wasm: WasmBridge, ref: EmbedTableRefV1): number {
  let sum = 0;
  for (const b of dedupe(cellsOf(wasm, ref)).filter((c) => c.row === 0)) {
    try { sum += wasm.getCellProperties(ref.sec, ref.ppi, ref.ci, b.cellIdx).width; } catch { return 0; }
  }
  return sum;
}

/** 경계 `line`(0 = 첫 행·열 앞)에 행·열 하나를 넣는다. 캐럿은 새 줄의 첫 칸 */
export function tableInsertAt(ih: InputHandler, req: EmbedTableRefV1 & { axis: 'row' | 'col'; line: number }): { ok: boolean; index?: number; rects?: EmbedPageRectV1[] } {
  const out: { rects?: EmbedPageRectV1[] } = {};
  if (ih.isInCellSelectionMode()) ih.exitCellSelectionMode();
  ih.executeOperation({
    kind: 'snapshot',
    operationType: req.axis === 'row' ? 'insertTableRow' : 'insertTableColumn',
    operation: (wasm) => {
      const d = dims(wasm, req);
      const n = d ? (req.axis === 'row' ? d.rows : d.cols) : 0;
      if (!d || req.line > n) return null;
      const base = req.line === 0 ? 0 : req.line - 1;
      if (req.axis === 'row') wasm.insertTableRow(req.sec, req.ppi, req.ci, base, req.line > 0);
      else {
        // 열을 넣어도 표 너비는 그대로(워드 · lily-docs 처럼) — 넣은 뒤 모든 칸 너비를 같은 비율로 줄인다. 안 하면 표가 쪽 밖으로 자란다
        const before = rowWidth(wasm, req);
        wasm.insertTableColumn(req.sec, req.ppi, req.ci, base, req.line > 0);
        const after = rowWidth(wasm, req);
        if (before > 0 && after > before) {
          const k = before / after;
          wasm.runInBatch(() => {
            for (const b of dedupe(cellsOf(wasm, req))) {
              const w = wasm.getCellProperties(req.sec, req.ppi, req.ci, b.cellIdx).width;
              wasm.setCellProperties(req.sec, req.ppi, req.ci, b.cellIdx, { width: Math.max(1, Math.round(w * k)) });
            }
          });
        }
      }
      const cells = cellsOf(wasm, req);
      out.rects = bandRectsOf(cells, req.axis, req.line, req.line);
      const first = req.axis === 'row' ? cellAt(cells, req.line, 0) : cellAt(cells, 0, req.line);
      return first ? cellPos(req, first.cellIdx) : ih.getCursorPosition();
    },
  });
  ih.focus();
  return out.rects ? { ok: true, index: req.line, rects: out.rects } : { ok: false };
}

/** 고른 행·열(셀 블록, 없으면 캐럿 칸의 줄)·표를 지운다. 모든 행·열이면 표를 지운다 */
export function tableDeleteLines(ih: InputHandler, wasm: WasmBridge, req: { what: 'rows' | 'cols' | 'table' }): { ok: boolean } {
  const cur = currentTable(ih);
  if (!cur) return { ok: false };
  const { ref } = cur;
  const d = dims(wasm, ref);
  const r = cur.object && d ? { r0: 0, c0: 0, r1: d.rows - 1, c1: d.cols - 1 } : currentRange(ih, cellsOf(wasm, ref));
  if (!d || !r) return { ok: false };
  const all = req.what === 'table' || (req.what === 'rows' ? r.r0 === 0 && r.r1 === d.rows - 1 : r.c0 === 0 && r.c1 === d.cols - 1);
  if (ih.isInCellSelectionMode()) ih.exitCellSelectionMode();
  if (cur.object) (ih as unknown as IhInternals).cursor.exitTableObjectSelection();
  let ok = false;
  ih.executeOperation({
    kind: 'snapshot',
    operationType: all ? 'deleteTable' : req.what === 'rows' ? 'deleteTableRow' : 'deleteTableColumn',
    operation: (w) => {
      if (all) {
        w.deleteTableControl(ref.sec, ref.ppi, ref.ci);
        ok = true;
        return { sectionIndex: ref.sec, paragraphIndex: ref.ppi, charOffset: 0 };
      }
      if (req.what === 'rows') for (let i = r.r1; i >= r.r0; i -= 1) w.deleteTableRow(ref.sec, ref.ppi, ref.ci, i);
      else for (let i = r.c1; i >= r.c0; i -= 1) w.deleteTableColumn(ref.sec, ref.ppi, ref.ci, i);
      ok = true;
      const nd = dims(w, ref);
      const cells = cellsOf(w, ref);
      const at = nd ? cellAt(cells, Math.min(r.r0, nd.rows - 1), Math.min(r.c0, nd.cols - 1)) : undefined;
      return at ? cellPos(ref, at.cellIdx) : { sectionIndex: ref.sec, paragraphIndex: ref.ppi, charOffset: 0 };
    },
  });
  ih.focus();
  return { ok };
}

/** 행·열 하나를 경계 `line` 앞으로 옮긴다(칸이 통째로). 옮긴 줄을 셀 블록으로 고른다 */
export function tableMove(ih: InputHandler, wasm: WasmBridge, req: EmbedTableRefV1 & { axis: 'row' | 'col'; from: number; line: number }): { ok: boolean; index?: number; rects?: EmbedPageRectV1[]; reason?: 'merged' | 'range' } {
  const d = dims(wasm, req);
  const n = d ? (req.axis === 'row' ? d.rows : d.cols) : 0;
  if (!d || req.from >= n || req.line > n) return { ok: false, reason: 'range' };
  const to = req.line > req.from ? req.line - 1 : req.line;
  if (to === req.from) return { ok: true, index: to, rects: [] };
  if (moveBlocked(cellsOf(wasm, req), req.axis, req.from, req.line)) return { ok: false, reason: 'merged' };
  if (ih.isInCellSelectionMode()) ih.exitCellSelectionMode();
  const out: { index?: number } = {};
  ih.executeOperation({
    kind: 'snapshot',
    operationType: req.axis === 'row' ? 'moveTableRow' : 'moveTableColumn',
    operation: (w) => {
      const raw = (w as unknown as { doc: RawDoc }).doc;
      try {
        const res = JSON.parse(req.axis === 'row'
          ? raw.moveTableRow(req.sec, req.ppi, req.ci, req.from, req.line)
          : raw.moveTableColumn(req.sec, req.ppi, req.ci, req.from, req.line)) as { ok: boolean; index: number };
        out.index = res.index;
      } catch {
        return null;
      }
      const cells = cellsOf(w, req);
      const first = req.axis === 'row' ? cellAt(cells, to, 0) : cellAt(cells, 0, to);
      return first ? cellPos(req, first.cellIdx) : ih.getCursorPosition();
    },
  });
  if (out.index === undefined) return { ok: false, reason: 'merged' };
  const at = out.index;
  if (req.axis === 'row') selectBlock(ih, wasm, req, at, 0, at, d.cols - 1);
  else selectBlock(ih, wasm, req, 0, at, d.rows - 1, at);
  return { ok: true, index: at, rects: bandRectsOf(cellsOf(wasm, req), req.axis, at, at) };
}

/** 고른 범위(셀 블록, 없으면 캐럿 칸)의 칸들에 같은 snapshot 안에서 일을 한다 */
function eachCell(ih: InputHandler, wasm: WasmBridge, type: string, fn: (w: WasmBridge, ref: EmbedTableRefV1, b: CellBbox, r: { r0: number; c0: number; r1: number; c1: number }) => void): { ok: boolean } {
  const cur = currentTable(ih);
  if (!cur) return { ok: false };
  const { ref } = cur;
  const d = dims(wasm, ref);
  const r = cur.object && d ? { r0: 0, c0: 0, r1: d.rows - 1, c1: d.cols - 1 } : currentRange(ih, cellsOf(wasm, ref));
  if (!r) return { ok: false };
  let ok = false;
  ih.executeOperation({
    kind: 'snapshot',
    operationType: type,
    operation: (w) => {
      const cells = dedupe(cellsOf(w, ref)).filter((b) => overlaps(b, r.r0, r.c0, r.r1, r.c1));
      w.runInBatch(() => { for (const b of cells) fn(w, ref, b, r); });
      ok = cells.length > 0;
      return ih.getCursorPosition();
    },
  });
  return { ok };
}

/** 셀 테두리: 여덟 종류(켜기 · 끄기) 또는 restyle(보이는 선을 그 모양 · 굵기 · 색으로) */
export function tableSetBorders(ih: InputHandler, wasm: WasmBridge, req: EmbedSetBordersV1): { ok: boolean } {
  const pen = (old: Line): Line => ({
    type: req.style ? BORDER_TYPE_OF[req.style]! : old.type || 1,
    width: req.widthPt !== undefined ? widthIdxOfPt(req.widthPt) : old.type ? old.width : 1,
    color: req.color !== undefined ? (req.color ?? '#000000') : old.type ? old.color : '#000000',
  });
  return eachCell(ih, wasm, 'cellBorderFill', (w, ref, b, r) => {
    const p = w.getCellProperties(ref.sec, ref.ppi, ref.ci, b.cellIdx) as unknown as Record<string, unknown>;
    const cur = (s: Side): Line => {
      const v = p[SIDE_KEY[s]];
      return isRecord(v) && typeof v.type === 'number' ? { type: v.type, width: Number(v.width) || 0, color: String(v.color ?? '#000000') } : { type: 0, width: 0, color: '#000000' };
    };
    const next: Record<string, Line> = {};
    for (const s of ['top', 'bottom', 'left', 'right'] as const) next[SIDE_KEY[s]] = cur(s);
    if (req.kind === 'restyle') {
      for (const s of ['top', 'bottom', 'left', 'right'] as const) if (cur(s).type !== 0) next[SIDE_KEY[s]] = pen(cur(s));
    } else {
      const on = req.kind === 'none' ? false : req.on ?? true;
      for (const s of sidesFor(req.kind, b, r)) next[SIDE_KEY[s]] = on ? pen(cur(s)) : { type: 0, width: cur(s).width, color: cur(s).color };
    }
    w.setCellProperties(ref.sec, ref.ppi, ref.ci, b.cellIdx, next as never);
  });
}

/** 셀 세로 맞춤(가로 맞춤은 문단 모양 — format.setPara 가 셀 블록에 듣는다) */
export function tableSetCellAlign(ih: InputHandler, wasm: WasmBridge, req: { v: 'top' | 'center' | 'bottom' }): { ok: boolean } {
  const va = V_ALIGN.indexOf(req.v);
  return eachCell(ih, wasm, 'cellProps', (w, ref, b) => { w.setCellProperties(ref.sec, ref.ppi, ref.ci, b.cellIdx, { verticalAlign: va }); });
}

/** 제목 줄: 첫 행 칸을 제목 칸으로 + 표의 제목 줄 자동 반복(표 › 셀 속성 대화 상자의 두 칸) */
export function tableSetHeaderRow(ih: InputHandler, wasm: WasmBridge, req: { on: boolean }): { ok: boolean } {
  const cur = currentTable(ih);
  if (!cur) return { ok: false };
  const { ref } = cur;
  let ok = false;
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'tableProps',
    operation: (w) => {
      w.runInBatch(() => {
        for (const b of dedupe(cellsOf(w, ref)).filter((c) => c.row === 0)) w.setCellProperties(ref.sec, ref.ppi, ref.ci, b.cellIdx, { isHeader: req.on });
        w.setTableProperties(ref.sec, ref.ppi, ref.ci, { repeatHeader: req.on });
      });
      ok = true;
      return ih.getCursorPosition();
    },
  });
  void wasm;
  return { ok };
}
