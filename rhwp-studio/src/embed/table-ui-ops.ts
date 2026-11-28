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
  /** [lily 2] 본문 상자 왼쪽 · 오른쪽(쪽 여백선, px) — 캐럿 없는 표의 경계 끌기 맞춤선 */
  bodyLeft?: number;
  bodyRight?: number;
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
  /** [lily 2] 표가 그려진 쪽마다의 꼴(머리 띠 · 경계 끌기 · 크기 손잡이) — 쪽 좌표 */
  grids: EmbedTablePageGridV1[];
  /** [lily 2] 투명 선(테두리 없는 칸 변의 화면 점선) 보기 */
  gridlines: boolean;
  /** [lily 2] 고른 칸(없으면 캐럿 칸)의 크기 · 표 안 여백 · 글 방향(속성 패널 레이아웃 갈래) */
  size: EmbedTableSizeV1;
}

/** [lily 2] 한 쪽에 그려진 표 조각의 꼴 */
export interface EmbedTablePageGridV1 {
  page: number;
  pageWidth: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  colLines: number[];
  rowBands: { row: number; top: number; bottom: number }[];
  /** 첫 행 · 마지막 행이 이 쪽에 있다 */
  first: boolean;
  last: boolean;
  /** 본문 상자 왼쪽 · 오른쪽(쪽 여백선, px) — 표 너비 맞춤선 */
  bodyLeft: number;
  bodyRight: number;
}

/** [lily 2] 크기 값(mm, 고른 줄이 모두 같을 때만 — 아니면 null) */
export interface EmbedTableSizeV1 {
  /** 칸에 지정한 높이 */
  rowHeightMm: number | null;
  /** 그려진 행 높이(지정 높이보다 글이 길면 더 크다) */
  rowHeightLaidMm: number | null;
  colWidthMm: number | null;
  /** 표 안 여백(표 속성 — 칸마다 따로 준 여백은 그 칸이 이긴다) */
  padding: { top: number; bottom: number; left: number; right: number };
  textDirection: 'horizontal' | 'vertical';
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
export type EmbedCellHAlignV1 = 'left' | 'center' | 'right' | 'justify';
export function parseCellAlign(p: Record<string, unknown>): { v?: 'top' | 'center' | 'bottom'; h?: EmbedCellHAlignV1 } {
  const out: { v?: 'top' | 'center' | 'bottom'; h?: EmbedCellHAlignV1 } = {};
  if (p.v !== undefined) {
    if (p.v !== 'top' && p.v !== 'center' && p.v !== 'bottom') throw new Error('v must be top, center or bottom');
    out.v = p.v;
  }
  // [lily 2] 가로 맞춤(칸 안 문단 모두) — 9칸 맞춤이 세로와 함께 한 단계로
  if (p.h !== undefined) {
    if (p.h !== 'left' && p.h !== 'center' && p.h !== 'right' && p.h !== 'justify') throw new Error('h must be left, center, right or justify');
    out.h = p.h;
  }
  if (!out.v && !out.h) throw new Error('v must be top, center or bottom');
  return out;
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
  return {
    ref, page: req.page, pageWidth: info.width, rows: d.rows, cols: d.cols, ...g, cell: [cell.x, cell.y, cell.w, cell.h], cellRow: cell.row, cellCol: cell.col,
    bodyLeft: info.bodyLeft ?? info.marginLeft, bodyRight: info.bodyRight ?? info.width - info.marginRight,
  };
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
  let gridlines = false;
  try { gridlines = wasm.getShowTransparentBorders(); } catch { /* 모름 */ }
  return {
    ref, rows: d.rows, cols: d.cols,
    caret: caretCell ? { row: caretCell.row, col: caretCell.col } : null,
    sel, objectSelected: cur.object,
    selFrames: framesOf(inRange), tableFrames: framesOf(cells), pageWidths,
    fill, vAlign: V_ALIGN[fp?.verticalAlign ?? 0] ?? 'top', borders, headerRow,
    grids: pageGridsOf(wasm, cells, d.rows, d.cols),
    gridlines,
    size: sizeState(wasm, ref, uniq, cells, r, propOf, fp),
  };
}

// ── [lily 2] 머리 띠 · 경계 끌기 · 크기 · 레이아웃 갈래(2026-11-28 — lily-docs 표 머리 띠 · 속성 패널을 에이치독스에) ──

const HWP_PER_PX = 75; // 1 쪽 px(96 DPI) = 75 HWPUNIT
const MM_PER_HWP = 25.4 / 7200;
const mm2 = (hwp: number) => Math.round(hwp * MM_PER_HWP * 100) / 100;
const hwpOfMm = (mm: number) => Math.round(mm / MM_PER_HWP);

/** 표가 그려진 쪽마다의 꼴 */
export function pageGridsOf(wasm: Pick<WasmBridge, 'getPageInfo'>, cells: readonly CellBbox[], rows: number, cols: number): EmbedTablePageGridV1[] {
  const pages = [...new Set(cells.map((b) => b.pageIndex))].sort((a, b) => a - b);
  const out: EmbedTablePageGridV1[] = [];
  for (const page of pages) {
    const on = cells.filter((b) => b.pageIndex === page);
    const g = gridOfCells(on, cols);
    if (!g) continue;
    let info: { width: number; bodyLeft?: number; bodyRight?: number; marginLeft: number; marginRight: number } | null = null;
    try { info = wasm.getPageInfo(page); } catch { info = null; }
    const width = info?.width ?? 0;
    out.push({
      page, pageWidth: width, ...g,
      last: on.some((b) => spanEnd(b.row, b.rowSpan) >= rows - 1),
      bodyLeft: info ? (info.bodyLeft ?? info.marginLeft) : 0,
      bodyRight: info ? (info.bodyRight ?? width - info.marginRight) : 0,
    });
  }
  return out;
}

/** 모두 같은 값이면 그 값, 아니면 null */
const sameOf = (xs: readonly number[], eps = 1): number | null => (xs.length && xs.every((x) => Math.abs(x - xs[0]!) <= eps) ? xs[0]! : null);

/** 행마다 그려진 높이(px) — 여러 쪽에 걸친 행은 조각을 더한다. 한 칸짜리 칸에서 잰다 */
export function laidRowHeights(cells: readonly CellBbox[], rows: number): number[] {
  const out: number[] = [];
  for (let r = 0; r < rows; r += 1) {
    const byPage = new Map<number, number>();
    for (const b of cells) if (b.row === r && Math.max(1, b.rowSpan) === 1) byPage.set(b.pageIndex, Math.max(byPage.get(b.pageIndex) ?? 0, b.h));
    out.push([...byPage.values()].reduce((a, b) => a + b, 0));
  }
  return out;
}

/** 열 너비(HWPUNIT) — 한 칸짜리 칸의 너비, 모두 합친 열은 그 칸 너비를 나눈다 */
export function columnWidths(uniq: readonly CellBbox[], cols: number, widthOf: (b: CellBbox) => number): number[] {
  const w: (number | null)[] = Array.from({ length: cols }, () => null);
  for (const b of uniq) if (Math.max(1, b.colSpan) === 1 && w[b.col] === null) w[b.col] = widthOf(b);
  for (const b of uniq) {
    const span = Math.max(1, b.colSpan);
    if (span === 1) continue;
    const idx = Array.from({ length: span }, (_, i) => b.col + i).filter((c) => c < cols);
    const missing = idx.filter((c) => w[c] === null);
    if (!missing.length) continue;
    const known = idx.filter((c) => w[c] !== null).reduce((a, c) => a + w[c]!, 0);
    const each = Math.max(1, (widthOf(b) - known) / missing.length);
    for (const c of missing) w[c] = each;
  }
  return w.map((x) => x ?? 0);
}

function sizeState(
  wasm: WasmBridge, ref: EmbedTableRefV1, uniq: readonly CellBbox[], cells: readonly CellBbox[],
  r: { r0: number; c0: number; r1: number; c1: number } | null, propOf: (idx: number) => ReturnType<WasmBridge['getCellProperties']> | undefined,
  fp: ReturnType<WasmBridge['getCellProperties']> | undefined,
): EmbedTableSizeV1 {
  const pad = { top: 0, bottom: 0, left: 0, right: 0 };
  try {
    const tp = wasm.getTableProperties(ref.sec, ref.ppi, ref.ci);
    Object.assign(pad, { top: mm2(tp.paddingTop), bottom: mm2(tp.paddingBottom), left: mm2(tp.paddingLeft), right: mm2(tp.paddingRight) });
  } catch { /* 모름 */ }
  const rows = r ? uniq.filter((b) => Math.max(1, b.rowSpan) === 1 && b.row >= r.r0 && b.row <= r.r1) : [];
  const colsIn = r ? uniq.filter((b) => Math.max(1, b.colSpan) === 1 && b.col >= r.c0 && b.col <= r.c1) : [];
  const declared = sameOf(rows.map((b) => propOf(b.cellIdx)?.height ?? 0).filter((h) => h > 0));
  const laid = r ? sameOf(laidRowHeights(cells, r.r1 + 1).slice(r.r0, r.r1 + 1), 0.5) : null;
  const width = sameOf(colsIn.map((b) => propOf(b.cellIdx)?.width ?? 0).filter((w) => w > 0));
  return {
    rowHeightMm: declared === null ? null : mm2(declared),
    rowHeightLaidMm: laid === null ? null : mm2(laid * HWP_PER_PX),
    colWidthMm: width === null ? null : mm2(width),
    padding: pad,
    textDirection: fp?.textDirection === 1 ? 'vertical' : 'horizontal',
  };
}

const MIN_COL_HWP = 600; // 6pt — lily-docs 경계 끌기 하한과 같다
const MIN_ROW_HWP = 300; // 4pt

/**
 * 열 너비 · 행 높이를 새 값으로(칸마다 그 칸이 걸친 열 · 행의 합) — 엔진 resizeTableCells 한 번(글 다시 흘리기 포함).
 * `newCols` = 열마다 HWPUNIT(null = 그대로), `newRows` = 바뀐 행만 HWPUNIT(그 행에 걸친 칸만 높이를 다시 정한다, 나머지 행은 그려진 높이).
 */
function applySizes(w: WasmBridge, ref: EmbedTableRefV1, newCols: number[] | null, newRows: Map<number, number> | null): boolean {
  const all = cellsOf(w, ref);
  const uniq = dedupe(all);
  const d = dims(w, ref);
  if (!d) return false;
  const laid = laidRowHeights(all, d.rows).map((h) => h * HWP_PER_PX);
  const updates: { cellIdx: number; widthDelta?: number; heightDelta?: number }[] = [];
  for (const b of uniq) {
    let p;
    try { p = w.getCellProperties(ref.sec, ref.ppi, ref.ci, b.cellIdx); } catch { continue; }
    const u: { cellIdx: number; widthDelta?: number; heightDelta?: number } = { cellIdx: b.cellIdx };
    if (newCols) {
      let target = 0;
      for (let c = b.col; c < Math.min(d.cols, b.col + Math.max(1, b.colSpan)); c += 1) target += newCols[c]!;
      const dw = Math.round(target) - p.width;
      if (dw !== 0) u.widthDelta = dw;
    }
    if (newRows) {
      const span = Array.from({ length: Math.max(1, b.rowSpan) }, (_, i) => b.row + i).filter((x) => x < d.rows);
      if (span.some((x) => newRows.has(x))) {
        const target = span.reduce((a, x) => a + (newRows.get(x) ?? laid[x] ?? 0), 0);
        const dh = Math.round(target) - p.height;
        if (dh !== 0) u.heightDelta = dh;
      }
    }
    if (u.widthDelta !== undefined || u.heightDelta !== undefined) updates.push(u);
  }
  if (!updates.length) return false;
  w.resizeTableCells(ref.sec, ref.ppi, ref.ci, updates);
  return true;
}

const widthsOf = (w: WasmBridge, ref: EmbedTableRefV1, cols: number) =>
  columnWidths(dedupe(cellsOf(w, ref)), cols, (b) => { try { return w.getCellProperties(ref.sec, ref.ppi, ref.ci, b.cellIdx).width; } catch { return b.w * HWP_PER_PX; } });

/** 표 너비를 `before`(HWPUNIT)로 되돌린다 — 모든 열을 같은 비율로 */
function keepWidth(w: WasmBridge, ref: EmbedTableRefV1, before: number): void {
  const d = dims(w, ref);
  if (!d || before <= 0) return;
  const cols = widthsOf(w, ref, d.cols);
  const now = cols.reduce((a, b) => a + b, 0);
  if (now <= 0 || Math.abs(now - before) < 1) return;
  const k = before / now;
  applySizes(w, ref, cols.map((x) => x * k), null);
}

export type EmbedResizeModeV1 = 'share' | 'left' | 'ratio';
/**
 * 열 경계 `line` 을 `deltaHwp` 만큼 옮긴 뒤의 열 너비(lily-docs 경계 끌기와 같은 셋): share = 오른쪽 이웃이 메운다(표 너비 그대로),
 * left = 왼쪽 열만(표 너비가 바뀐다 — 오른쪽 끝 경계는 늘 이것), ratio = 오른쪽 열들이 비율대로(표 너비 그대로). 하한 = MIN_COL_HWP.
 */
export function resizedColumns(cols: readonly number[], line: number, deltaHwp: number, mode: EmbedResizeModeV1): number[] | null {
  const n = cols.length;
  if (line < 1 || line > n) return null;
  const out = [...cols];
  const m = line === n ? 'left' : mode;
  const left = cols[line - 1]!;
  let d = Math.max(deltaHwp, MIN_COL_HWP - left);
  if (m === 'share') {
    d = Math.min(d, cols[line]! - MIN_COL_HWP);
    out[line - 1] = left + d;
    out[line] = cols[line]! - d;
  } else if (m === 'ratio') {
    const rest = cols.slice(line).reduce((a, b) => a + b, 0);
    const narrow = Math.min(...cols.slice(line));
    d = Math.min(d, rest * (1 - MIN_COL_HWP / narrow));
    out[line - 1] = left + d;
    const f = (rest - d) / rest;
    for (let c = line; c < n; c += 1) out[c] = cols[c]! * f;
  } else {
    out[line - 1] = left + d;
  }
  return out;
}

export interface EmbedResizeLineV1 extends EmbedTableRefV1 { axis: 'row' | 'col'; line: number; deltaPx: number; mode: EmbedResizeModeV1 }
export function parseResizeLine(p: Record<string, unknown>): EmbedResizeLineV1 {
  const mode = p.mode ?? 'share';
  if (mode !== 'share' && mode !== 'left' && mode !== 'ratio') throw new Error('mode must be share, left or ratio');
  return { ...parseTableRef(p), axis: axisOf(p.axis), line: int(p.line, 'line', 0, 65535), deltaPx: num(p.deltaPx, 'deltaPx'), mode };
}

/** 경계 끌기: 열 경계 `line`(1 = 첫 열 오른쪽) · 행 `line` 의 아래 경계를 `deltaPx`(쪽 px)만큼 — 실행 취소 한 단계 */
export function tableResizeLine(ih: InputHandler, req: EmbedResizeLineV1): { ok: boolean } {
  let ok = false;
  if (ih.isInCellSelectionMode()) ih.exitCellSelectionMode();
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'resizeTableCells',
    operation: (w) => {
      const d = dims(w, req);
      if (!d) return null;
      const delta = req.deltaPx * HWP_PER_PX;
      if (req.axis === 'col') {
        const next = resizedColumns(widthsOf(w, req, d.cols), req.line, delta, req.mode);
        ok = !!next && applySizes(w, req, next, null);
      } else {
        if (req.line >= d.rows) return null;
        const laid = laidRowHeights(cellsOf(w, req), d.rows);
        ok = applySizes(w, req, null, new Map([[req.line, Math.max(MIN_ROW_HWP, laid[req.line]! * HWP_PER_PX + delta)]]));
      }
      return ok ? ih.getCursorPosition() : null;
    },
  });
  return { ok };
}

export interface EmbedResizeTableV1 extends EmbedTableRefV1 { page: number; widthPx: number; heightPx: number }
export function parseResizeTable(p: Record<string, unknown>): EmbedResizeTableV1 {
  const widthPx = num(p.widthPx, 'widthPx');
  const heightPx = num(p.heightPx, 'heightPx');
  if (widthPx <= 0 || heightPx <= 0) throw new Error('widthPx and heightPx must be positive');
  return { ...parseTableRef(p), page: int(p.page, 'page'), widthPx, heightPx };
}

/** 표 크기: 쪽 `page` 에 그려진 조각이 widthPx × heightPx 가 되게 — 모든 열 너비 · 그 쪽의 행 높이가 비율대로(실행 취소 한 단계) */
export function tableResize(ih: InputHandler, req: EmbedResizeTableV1): { ok: boolean } {
  let ok = false;
  if (ih.isInCellSelectionMode()) ih.exitCellSelectionMode();
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'resizeTableCells',
    operation: (w) => {
      const d = dims(w, req);
      const all = cellsOf(w, req);
      const g = gridOfCells(all.filter((b) => b.pageIndex === req.page), d?.cols ?? 0);
      if (!d || !g) return null;
      const [kx, ky] = [req.widthPx / Math.max(1, g.right - g.left), req.heightPx / Math.max(1, g.bottom - g.top)];
      const cols = widthsOf(w, req, d.cols).map((x) => Math.max(MIN_COL_HWP, x * kx));
      const laid = laidRowHeights(all, d.rows);
      const rows = new Map(g.rowBands.map((b) => [b.row, Math.max(MIN_ROW_HWP, laid[b.row]! * HWP_PER_PX * ky)] as [number, number]));
      ok = applySizes(w, req, Math.abs(kx - 1) > 1e-4 ? cols : null, Math.abs(ky - 1) > 1e-4 ? rows : null);
      return ok ? ih.getCursorPosition() : null;
    },
  });
  return { ok };
}

export interface EmbedSetCountV1 extends EmbedTableRefV1 { axis: 'row' | 'col'; n: number }
export const MAX_COUNT = { row: 999, col: 63 } as const;
export function parseSetCount(p: Record<string, unknown>): EmbedSetCountV1 {
  const axis = axisOf(p.axis);
  return { ...parseTableRef(p), axis, n: int(p.n, 'n', 1, MAX_COUNT[axis]) };
}

/** 열 수 · 행 수 칸: 끝에서 넣고 빼서 n 개로(끝 줄에 글이 있어도 뺀다 — 되돌리기로 살린다). 열은 표 너비 그대로. 실행 취소 한 단계 */
export function tableSetCount(ih: InputHandler, wasm: WasmBridge, req: EmbedSetCountV1): { ok: boolean; rects?: EmbedPageRectV1[] } {
  const d = dims(wasm, req);
  if (!d) return { ok: false };
  const from = req.axis === 'row' ? d.rows : d.cols;
  if (req.n === from) return { ok: true, rects: [] };
  const caret = ih.getCursorPosition();
  const caretCell = dedupe(cellsOf(wasm, req)).find((b) => caret.parentParaIndex === req.ppi && caret.controlIndex === req.ci && b.cellIdx === caret.cellIndex);
  if (ih.isInCellSelectionMode()) ih.exitCellSelectionMode();
  let ok = false;
  ih.executeOperation({
    kind: 'snapshot',
    operationType: req.n > from ? (req.axis === 'row' ? 'insertTableRow' : 'insertTableColumn') : (req.axis === 'row' ? 'deleteTableRow' : 'deleteTableColumn'),
    operation: (w) => {
      const before = req.axis === 'col' ? widthsOf(w, req, d.cols).reduce((a, b) => a + b, 0) : 0;
      for (let k = from; k < req.n; k += 1) {
        if (req.axis === 'row') w.insertTableRow(req.sec, req.ppi, req.ci, k - 1, true);
        else w.insertTableColumn(req.sec, req.ppi, req.ci, k - 1, true);
      }
      for (let k = from - 1; k >= req.n; k -= 1) {
        if (req.axis === 'row') w.deleteTableRow(req.sec, req.ppi, req.ci, k);
        else w.deleteTableColumn(req.sec, req.ppi, req.ci, k);
      }
      if (req.axis === 'col') keepWidth(w, req, before);
      ok = true;
      const nd = dims(w, req);
      const cells = cellsOf(w, req);
      const row = Math.min(caretCell?.row ?? 0, (nd?.rows ?? 1) - 1);
      const col = Math.min(caretCell?.col ?? 0, (nd?.cols ?? 1) - 1);
      const at = cellAt(cells, row, col);
      return at ? cellPos(req, at.cellIdx) : ih.getCursorPosition();
    },
  });
  // 포커스는 호스트 몫 — 수 칸(▴▾ · 숫자 칸)에 남아야 이어서 고친다(lily-docs 와 같다)
  if (!ok) return { ok: false };
  return { ok: true, rects: req.n > from ? bandRectsOf(cellsOf(wasm, req), req.axis, from, req.n - 1) : [] };
}

/** 투명 선 보기 — 호스트가 한 번 정하면 다음에 여는 문서에도(문서마다 엔진 값이 처음으로 돌아간다) */
let gridlinesPref: boolean | null = null;
export const gridlinesPreference = (): boolean | null => gridlinesPref;
export function parseGridlines(p: Record<string, unknown>): { on: boolean } {
  if (typeof p.on !== 'boolean') throw new Error('on must be true or false');
  return { on: p.on };
}
export function tableSetGridlines(wasm: WasmBridge, req: { on: boolean }, repaint: () => void): { ok: boolean } {
  gridlinesPref = req.on;
  if (wasm.pageCount === 0) return { ok: true };
  try { wasm.setShowTransparentBorders(req.on); } catch { return { ok: false }; }
  repaint();
  return { ok: true };
}

export interface EmbedCellSizeV1 { rowHeightMm?: number; colWidthMm?: number }
export function parseCellSize(p: Record<string, unknown>): EmbedCellSizeV1 {
  const out: EmbedCellSizeV1 = {};
  for (const k of ['rowHeightMm', 'colWidthMm'] as const) {
    if (p[k] === undefined) continue;
    const v = num(p[k], k);
    if (v < 0.5 || v > 2000) throw new Error(`${k} must be from 0.5 to 2000`);
    out[k] = v;
  }
  if (out.rowHeightMm === undefined && out.colWidthMm === undefined) throw new Error('rowHeightMm or colWidthMm is required');
  return out;
}
/** 고른 줄(없으면 캐럿 칸의 줄)의 행 높이 · 열 너비(mm) — 실행 취소 한 단계. 열 너비를 바꾸면 표 너비가 바뀐다 */
export function tableSetCellSize(ih: InputHandler, wasm: WasmBridge, req: EmbedCellSizeV1): { ok: boolean } {
  const cur = currentTable(ih);
  if (!cur) return { ok: false };
  const { ref } = cur;
  const d = dims(wasm, ref);
  const r = cur.object && d ? { r0: 0, c0: 0, r1: d.rows - 1, c1: d.cols - 1 } : currentRange(ih, cellsOf(wasm, ref));
  if (!d || !r) return { ok: false };
  let ok = false;
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'resizeTableCells',
    operation: (w) => {
      const cols = req.colWidthMm !== undefined ? widthsOf(w, ref, d.cols).map((x, c) => (c >= r.c0 && c <= r.c1 ? hwpOfMm(req.colWidthMm!) : x)) : null;
      const rows = req.rowHeightMm !== undefined ? new Map(Array.from({ length: r.r1 - r.r0 + 1 }, (_, i) => [r.r0 + i, hwpOfMm(req.rowHeightMm!)] as [number, number])) : null;
      ok = applySizes(w, ref, cols, rows);
      return ih.getCursorPosition();
    },
  });
  return { ok };
}

export interface EmbedPaddingV1 { top?: number; bottom?: number; left?: number; right?: number }
export function parsePadding(p: Record<string, unknown>): EmbedPaddingV1 {
  const out: EmbedPaddingV1 = {};
  for (const k of ['top', 'bottom', 'left', 'right'] as const) {
    if (p[k] === undefined) continue;
    const v = num(p[k], k);
    if (v < 0 || v > 100) throw new Error(`${k} must be from 0 to 100`);
    out[k] = v;
  }
  if (!Object.keys(out).length) throw new Error('one of top, bottom, left, right is required');
  return out;
}
/** 표 안 여백(mm): 표 속성 + 모든 칸(표 만들기가 둘을 같은 값으로 두는 것과 같게) — 실행 취소 한 단계 */
export function tableSetPadding(ih: InputHandler, req: EmbedPaddingV1): { ok: boolean } {
  const cur = currentTable(ih);
  if (!cur) return { ok: false };
  const { ref } = cur;
  const props: Record<string, number> = {};
  if (req.top !== undefined) props.paddingTop = hwpOfMm(req.top);
  if (req.bottom !== undefined) props.paddingBottom = hwpOfMm(req.bottom);
  if (req.left !== undefined) props.paddingLeft = hwpOfMm(req.left);
  if (req.right !== undefined) props.paddingRight = hwpOfMm(req.right);
  let ok = false;
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'tableProps',
    operation: (w) => {
      w.runInBatch(() => {
        w.setTableProperties(ref.sec, ref.ppi, ref.ci, props);
        for (const b of dedupe(cellsOf(w, ref))) w.setCellProperties(ref.sec, ref.ppi, ref.ci, b.cellIdx, props);
      });
      ok = true;
      return ih.getCursorPosition();
    },
  });
  return { ok };
}

export function parseTextDirection(p: Record<string, unknown>): { dir: 'horizontal' | 'vertical' } {
  if (p.dir !== 'horizontal' && p.dir !== 'vertical') throw new Error('dir must be horizontal or vertical');
  return { dir: p.dir };
}
/** 글 방향(가로 · 세로) — 고른 칸 모두, 실행 취소 한 단계 */
export function tableSetTextDirection(ih: InputHandler, wasm: WasmBridge, req: { dir: 'horizontal' | 'vertical' }): { ok: boolean } {
  return eachCell(ih, wasm, 'cellProps', (w, ref, b) => { w.setCellProperties(ref.sec, ref.ppi, ref.ci, b.cellIdx, { textDirection: req.dir === 'vertical' ? 1 : 0 }); });
}

export interface EmbedSplitCellsV1 { rows: number; cols: number; mergeFirst: boolean }
export function parseSplitCells(p: Record<string, unknown>): EmbedSplitCellsV1 {
  if (typeof p.mergeFirst !== 'boolean') throw new Error('mergeFirst must be true or false');
  return { rows: int(p.rows, 'rows', 1, 63), cols: int(p.cols, 'cols', 1, 63), mergeFirst: p.mergeFirst };
}
/** 셀 나누기: 고른 칸(없으면 캐럿 칸)을 행 · 열 수로 — 먼저 합치기를 켜면 고른 범위를 한 칸으로 합친 뒤 나눈다. 실행 취소 한 단계 */
export function tableSplitCells(ih: InputHandler, wasm: WasmBridge, req: EmbedSplitCellsV1): { ok: boolean } {
  const cur = currentTable(ih);
  if (!cur || cur.object) return { ok: false };
  const { ref } = cur;
  const r = currentRange(ih, cellsOf(wasm, ref));
  if (!r) return { ok: false };
  if (ih.isInCellSelectionMode()) ih.exitCellSelectionMode();
  let ok = false;
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'splitTableCell',
    operation: (w) => {
      const many = r.r1 > r.r0 || r.c1 > r.c0;
      if (many && req.mergeFirst) {
        w.mergeTableCells(ref.sec, ref.ppi, ref.ci, r.r0, r.c0, r.r1, r.c1);
        ok = w.splitTableCellInto(ref.sec, ref.ppi, ref.ci, r.r0, r.c0, req.rows, req.cols, true, false).ok;
      } else if (many) {
        ok = w.splitTableCellsInRange(ref.sec, ref.ppi, ref.ci, r.r0, r.c0, r.r1, r.c1, req.rows, req.cols, true).ok;
      } else {
        ok = w.splitTableCellInto(ref.sec, ref.ppi, ref.ci, r.r0, r.c0, req.rows, req.cols, true, false).ok;
      }
      const at = cellAt(cellsOf(w, ref), r.r0, r.c0);
      return at ? cellPos(ref, at.cellIdx) : ih.getCursorPosition();
    },
  });
  ih.focus();
  return { ok };
}

/** 새 표의 꼴(LilyOffice 에이치독스 table-ui/defaults.ts 와 같은 값) — 원래대로 */
const RESET_LINE = { type: 1, width: 1, color: '#000000' };
const RESET_HEADER_FILL = '#f2f2f2';
const RESET_SIZE = 1100; // 11pt
/**
 * 표 꾸밈을 새 표처럼(lily-docs 표 스타일 원래대로와 같은 일): 칸 바탕 없앰 · 제목 줄이면 첫 행 옅은 회색 + 굵게, 모든 테두리 = 실선 0.12mm 검정,
 * 글자 = 11pt · 검정 · 굵게 · 기울임 · 밑줄 · 취소선 없음(제목 행은 굵게). 글꼴 · 문단 모양 · 칸 크기는 그대로. 실행 취소 한 단계
 */
export function tableResetStyle(ih: InputHandler): { ok: boolean } {
  const cur = currentTable(ih);
  if (!cur) return { ok: false };
  const { ref } = cur;
  let ok = false;
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'cellBorderFill',
    operation: (w) => {
      let header = false;
      try { header = !!w.getTableProperties(ref.sec, ref.ppi, ref.ci).repeatHeader; } catch { /* 모름 */ }
      w.runInBatch(() => {
        for (const b of dedupe(cellsOf(w, ref))) {
          const head = header && b.row === 0;
          w.setCellProperties(ref.sec, ref.ppi, ref.ci, b.cellIdx, {
            ...(head ? { fillType: 'solid', fillColor: RESET_HEADER_FILL } : { fillType: 'none' }),
            borderLeft: RESET_LINE, borderRight: RESET_LINE, borderTop: RESET_LINE, borderBottom: RESET_LINE,
          } as never);
          let n = 1;
          try { n = w.getCellParagraphCount(ref.sec, ref.ppi, ref.ci, b.cellIdx); } catch { n = 1; }
          for (let p = 0; p < n; p += 1) {
            let len = 0;
            try { len = w.getCellParagraphLength(ref.sec, ref.ppi, ref.ci, b.cellIdx, p); } catch { len = 0; }
            w.applyCharFormatInCell(ref.sec, ref.ppi, ref.ci, b.cellIdx, p, 0, len, JSON.stringify({
              fontSize: RESET_SIZE, bold: head, italic: false, underline: false, strikethrough: false, textColor: '#000000',
            }));
          }
        }
      });
      ok = true;
      return ih.getCursorPosition();
    },
  });
  return { ok };
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
      // [lily 2] 열을 지워도 표 너비는 그대로(lily-docs 와 같다) — 남은 열을 비율대로 넓힌다
      const before = req.what === 'cols' ? widthsOf(w, ref, d.cols).reduce((a, b) => a + b, 0) : 0;
      if (req.what === 'rows') for (let i = r.r1; i >= r.r0; i -= 1) w.deleteTableRow(ref.sec, ref.ppi, ref.ci, i);
      else for (let i = r.c1; i >= r.c0; i -= 1) w.deleteTableColumn(ref.sec, ref.ppi, ref.ci, i);
      if (req.what === 'cols') keepWidth(w, ref, before);
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
    // [lily 2] 테두리만 바꿔도 칸 바탕이 남게 — 칸 속성은 테두리와 바탕을 한 borderFill 로 다시 만든다(빠진 바탕 = 없음)
    for (const k of ['fillType', 'fillColor', 'patternColor', 'patternType'] as const) if (p[k] !== undefined) (next as Record<string, unknown>)[k] = p[k];
    w.setCellProperties(ref.sec, ref.ppi, ref.ci, b.cellIdx, next as never);
  });
}

/** 셀 세로 맞춤 · [lily 2] 가로 맞춤(칸 안 문단 모두 — 세로와 같이 주면 한 단계) */
export function tableSetCellAlign(ih: InputHandler, wasm: WasmBridge, req: { v?: 'top' | 'center' | 'bottom'; h?: EmbedCellHAlignV1 }): { ok: boolean } {
  const va = req.v ? V_ALIGN.indexOf(req.v) : -1;
  return eachCell(ih, wasm, 'cellProps', (w, ref, b) => {
    if (va >= 0) w.setCellProperties(ref.sec, ref.ppi, ref.ci, b.cellIdx, { verticalAlign: va });
    if (req.h) {
      let n = 1;
      try { n = w.getCellParagraphCount(ref.sec, ref.ppi, ref.ci, b.cellIdx); } catch { n = 1; }
      for (let p = 0; p < n; p += 1) w.applyParaFormatInCell(ref.sec, ref.ppi, ref.ci, b.cellIdx, p, JSON.stringify({ alignment: req.h }));
    }
  });
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
