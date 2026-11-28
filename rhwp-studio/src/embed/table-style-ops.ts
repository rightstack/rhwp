/**
 * [lily] 표 스타일(호스트 LilyOffice 에이치독스 [표] 패널 디자인 갈래 — lily-docs 표 스타일 갤러리 · 스타일 옵션 여섯과 같은 꼴, 2026-11-28).
 *
 * HWP 에는 Word 표 스타일(조건부 서식 묶음) 같은 개체가 없다. 그래서 호스트가 고른 스타일 카드(lily-docs 브리지 `table_styles` 카드와 같은 모양 —
 * 제목 행 · 요약 행 · 제목 열 · 마지막 열 · 줄무늬 행/열 · 바탕 · 테두리 색)와 옵션을 칸마다 직접 꾸밈(바탕 · 테두리 · 굵게 · 글자 색)으로 넣고,
 * 무엇을 골랐는지는 표의 개체 설명문에 `lily-table-style:` + JSON 으로 남긴다(Rust `object_ops/lily_table.rs` — hwp · hwpx 저장에 실린다).
 * 줄을 넣고 빼고 옮기면 같은 snapshot 안에서 다시 꾸민다(`restyleAfter`) — 요약 행 · 마지막 열 · 줄무늬가 새 줄 수를 따른다.
 *
 * 꼴 = lily-docs 가 그 스타일을 건 표를 그린 모양(2026-11-28 열세 스타일 × 옵션 두 꼴을 나란히 대조): 모든 칸 변 실선 ½pt(카드 테두리 색, 없으면 검정) —
 * List Table 3 은 바깥 테두리만(`outerOnly`), 요약 행 위 = 이중선(List Table 3 은 카드 색 실선), 줄무늬 행이 줄무늬 열보다 앞선다.
 * 카드에 없는 부분을 켜면 lily-docs 브리지 `part_default` 와 같은 기본(제목 행 = 굵게 + F2F2F2 · 요약 행 = 굵게 + 위 검정 이중선 · 줄무늬 = F5F5F5 · 열 = 굵게).
 * 스타일 없음(카드 null) = 테두리 · 바탕 · 강조 없음(화면에는 투명 선 점선).
 */
import type { WasmBridge } from '../core/wasm-bridge.ts';
import type { CellBbox } from '../core/types.ts';

export interface EmbedTableStyleCardV1 {
  id: string;
  name?: string;
  header?: string | null;
  headerBold?: boolean;
  headerColor?: string | null;
  fill?: string | null;
  band?: string | null;
  bandCol?: string | null;
  total?: string | null;
  totalBold?: boolean;
  totalRule?: boolean;
  firstCol?: string | null;
  firstColBold?: boolean;
  lastCol?: string | null;
  lastColBold?: boolean;
  border?: string | null;
  /** 바깥 테두리만(Word List Table 3 — 안쪽 변은 선 없음, 요약 행 위는 카드 색 실선) */
  outerOnly?: boolean;
}
export interface EmbedTableLookV1 { headerRow: boolean; firstColumn: boolean; totalRow: boolean; lastColumn: boolean; bandedRows: boolean; bandedColumns: boolean }
export interface EmbedTableStyleV1 { card: EmbedTableStyleCardV1 | null; look: EmbedTableLookV1 }

export const STYLE_MARK = 'lily-table-style:';
export const LOOK_KEYS = ['headerRow', 'firstColumn', 'totalRow', 'lastColumn', 'bandedRows', 'bandedColumns'] as const;

/** 새 표 · 원래대로 = lily-docs 기본 "Lily Table Grid"(제목 행만) */
export const LILY_TABLE_GRID: EmbedTableStyleCardV1 = {
  id: 'LilyTableGrid', name: 'Lily Table Grid', header: 'F2F2F2', headerBold: true, band: 'F5F5F5', bandCol: 'F5F5F5',
  firstColBold: true, lastColBold: true, totalBold: true, totalRule: true,
};
export const HEADER_ONLY: EmbedTableLookV1 = { headerRow: true, firstColumn: false, totalRow: false, lastColumn: false, bandedRows: false, bandedColumns: false };

const HEX = /^[0-9a-fA-F]{6}$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseStyle(v: unknown, name = 'style'): EmbedTableStyleV1 {
  if (!isRecord(v)) throw new Error(`${name} must be an object`);
  const look = v.look;
  if (!isRecord(look)) throw new Error(`${name}.look must be an object`);
  const out: EmbedTableLookV1 = { ...HEADER_ONLY, headerRow: false };
  for (const k of LOOK_KEYS) {
    if (typeof look[k] !== 'boolean') throw new Error(`${name}.look.${k} must be true or false`);
    out[k] = look[k] as boolean;
  }
  if (v.card === null) return { card: null, look: out };
  const c = v.card;
  if (!isRecord(c) || typeof c.id !== 'string' || !c.id || c.id.length > 64) throw new Error(`${name}.card must be null or an object with an id`);
  const card: EmbedTableStyleCardV1 = { id: c.id };
  if (typeof c.name === 'string') card.name = c.name.slice(0, 80);
  for (const k of ['header', 'headerColor', 'fill', 'band', 'bandCol', 'total', 'firstCol', 'lastCol', 'border'] as const) {
    const x = c[k];
    if (x === undefined || x === null) continue;
    if (typeof x !== 'string' || !HEX.test(x)) throw new Error(`${name}.card.${k} must be RRGGBB or null`);
    card[k] = x.toUpperCase();
  }
  for (const k of ['headerBold', 'totalBold', 'totalRule', 'firstColBold', 'lastColBold', 'outerOnly'] as const) {
    if (c[k] === undefined) continue;
    if (typeof c[k] !== 'boolean') throw new Error(`${name}.card.${k} must be true or false`);
    card[k] = c[k] as boolean;
  }
  return { card, look: out };
}

/** 설명문 → 스타일(우리 표지가 아니면 null) */
export function styleOfDescription(desc: string | null | undefined): EmbedTableStyleV1 | null {
  if (!desc || !desc.startsWith(STYLE_MARK)) return null;
  try { return parseStyle(JSON.parse(desc.slice(STYLE_MARK.length))); } catch { return null; }
}
export const descriptionOfStyle = (s: EmbedTableStyleV1) => STYLE_MARK + JSON.stringify(s);

/** 켠 옵션에 카드가 꾸밈을 주지 않으면 lily-docs 브리지 part_default 를 더한다. `ruleOwn` = 요약 행 선이 카드 것인가(아니면 기본 검정 이중선) */
export function effectiveCard(card: EmbedTableStyleCardV1, look: EmbedTableLookV1): EmbedTableStyleCardV1 & { ruleOwn?: boolean } {
  const c: EmbedTableStyleCardV1 & { ruleOwn?: boolean } = { ...card, ruleOwn: !!card.totalRule };
  if (look.headerRow && !c.header && !c.headerBold && !c.headerColor) { c.header = 'F2F2F2'; c.headerBold = true; }
  if (look.totalRow && !c.total && !c.totalBold && !c.totalRule) { c.totalBold = true; c.totalRule = true; c.ruleOwn = false; }
  if (look.bandedRows && !c.band) c.band = 'F5F5F5';
  if (look.bandedColumns && !c.bandCol) c.bandCol = 'F5F5F5';
  if (look.firstColumn && !c.firstCol && !c.firstColBold) c.firstColBold = true;
  if (look.lastColumn && !c.lastCol && !c.lastColBold) c.lastColBold = true;
  if (!card.totalRule && !c.ruleOwn) delete c.ruleOwn;
  return c;
}

/** 칸 변 하나: 선 종류(0 없음 · 1 실선 · 8 이중선) · 색 RRGGBB */
export interface SideV1 { type: 0 | 1 | 8; color: string }
export interface CellLookV1 { fill: string | null; bold: boolean; color: string | null; top: SideV1; bottom: SideV1; left: SideV1; right: SideV1 }

const NONE: SideV1 = { type: 0, color: '000000' };

/** 칸 하나의 꼴(행 r · 열 c 에서 시작해 rs × cs 를 걸친 칸, 표 R × C) — lily-docs 가 그린 차례 */
export function cellLook(style: EmbedTableStyleV1, r: number, c: number, rs: number, cs: number, R: number, C: number): CellLookV1 {
  if (!style.card) return { fill: null, bold: false, color: null, top: NONE, bottom: NONE, left: NONE, right: NONE };
  const look = style.look;
  const k = effectiveCard(style.card, look);
  const rEnd = r + Math.max(1, rs) - 1;
  const cEnd = c + Math.max(1, cs) - 1;
  const isHead = look.headerRow && r === 0;
  const isTotal = look.totalRow && R > 1 && rEnd === R - 1 && !isHead;
  const isFirst = look.firstColumn && c === 0 && !isHead;
  const isLast = look.lastColumn && C > 1 && cEnd === C - 1 && !isHead;
  const bandIdx = r - (look.headerRow ? 1 : 0);
  const rowBand = !!k.band && look.bandedRows && !isHead && !isTotal && bandIdx >= 0 && bandIdx % 2 === 0;
  const rowFill = isHead && k.header ? k.header : isTotal && k.total ? k.total : rowBand ? k.band! : k.fill ?? null;
  // 줄무늬 열: 제목 열 다음부터 하나 걸러 — 행에 칠(제목 행 칠 · 요약 행 칠 · 줄무늬 행)이 있으면 그 칠이 앞선다. 칠 없는 제목 행 · 요약 행 · 마지막 열에는 있다(lily-docs 가 그린 그대로)
  const colIdx = c - (look.firstColumn ? 1 : 0);
  const rowHasFill = (isHead && !!k.header) || (isTotal && !!k.total) || rowBand;
  const colBand = !!k.bandCol && look.bandedColumns && !rowHasFill && colIdx >= 0 && colIdx % 2 === 0;
  const cellFill = isFirst && k.firstCol ? k.firstCol : isLast && k.lastCol ? k.lastCol : colBand ? k.bandCol! : null;
  const bold = (isHead && !!k.headerBold) || (isTotal && !!k.totalBold) || (isFirst && !!k.firstColBold) || (isLast && !!k.lastColBold);
  const line = k.border ?? '000000';
  const edge = (outer: boolean): SideV1 => (k.outerOnly && !outer ? NONE : { type: 1, color: line });
  const side = { top: edge(r === 0), bottom: edge(rEnd === R - 1), left: edge(c === 0), right: edge(cEnd === C - 1) };
  // 요약 행 위 선(바로 위 행의 아래 변도 같게): 카드 것 = List Table 3 은 카드 색 실선 · 나머지 이중선, 기본 = 검정 이중선
  if (look.totalRow && k.totalRule && R > 1) {
    const rule: SideV1 = k.ruleOwn ? (k.outerOnly ? { type: 1, color: line } : { type: 8, color: line }) : { type: 8, color: '000000' };
    if (isTotal) side.top = rule;
    if (rEnd === R - 2) side.bottom = rule;
  }
  return { fill: cellFill ?? rowFill, bold, color: isHead && k.headerColor ? k.headerColor : null, ...side };
}

const spanEnd = (start: number, span: number) => start + Math.max(1, span) - 1;
const dedupe = (cells: readonly CellBbox[]) => {
  const seen = new Set<number>();
  return cells.filter((b) => (seen.has(b.cellIdx) ? false : (seen.add(b.cellIdx), true)));
};
interface Ref { sec: number; ppi: number; ci: number }
interface RawDoc { lilyTableDescription(sec: number, ppi: number, ci: number): string; lilySetTableDescription(sec: number, ppi: number, ci: number, text: string): string }
const raw = (w: WasmBridge) => (w as unknown as { doc: RawDoc }).doc;

export function readStyle(w: WasmBridge, ref: Ref): EmbedTableStyleV1 | null {
  try { return styleOfDescription((JSON.parse(raw(w).lilyTableDescription(ref.sec, ref.ppi, ref.ci)) as { description: string }).description); } catch { return null; }
}

/**
 * 표 전체를 스타일대로 꾸민다(snapshot 안에서 부른다). `chars` = 글자 꾸밈(굵게 · 색)을 줄 칸 — 'all' 이면 모두,
 * 아니면 그 판정에 드는 칸만(줄을 넣고 뺀 뒤 다시 꾸밀 때 — 가운데 칸의 사용자 굵게를 지키려고 가장자리 줄만). `clearText` = 글자 크기 11pt · 기울임 · 밑줄 · 취소선도 지운다(원래대로).
 * 바탕 · 테두리는 늘 모든 칸. 설명문 표지를 쓴다.
 */
export function applyStyle(w: WasmBridge, ref: Ref, style: EmbedTableStyleV1, chars: 'all' | ((b: CellBbox, R: number, C: number) => boolean), clearText = false): boolean {
  let dims: { rowCount: number; colCount: number };
  try { dims = w.getTableDimensions(ref.sec, ref.ppi, ref.ci); } catch { return false; }
  const [R, C] = [dims.rowCount, dims.colCount];
  let cells: CellBbox[] = [];
  try { cells = dedupe(w.getTableCellBboxes(ref.sec, ref.ppi, ref.ci)); } catch { return false; }
  if (!cells.length) return false;
  w.runInBatch(() => {
    for (const b of cells) {
      const L = cellLook(style, b.row, b.col, b.rowSpan, b.colSpan, R, C);
      const bl = (x: SideV1) => ({ type: x.type, width: 1, color: `#${x.color.toLowerCase()}` });
      const props: Record<string, unknown> = {
        ...(L.fill ? { fillType: 'solid', fillColor: `#${L.fill.toLowerCase()}` } : { fillType: 'none' }),
        borderLeft: bl(L.left), borderRight: bl(L.right), borderTop: bl(L.top), borderBottom: bl(L.bottom),
      };
      w.setCellProperties(ref.sec, ref.ppi, ref.ci, b.cellIdx, props as never);
      if (chars !== 'all' && !chars(b, R, C)) continue;
      const char: Record<string, unknown> = { bold: L.bold, textColor: L.color ? `#${L.color.toLowerCase()}` : '#000000' };
      if (clearText) Object.assign(char, { fontSize: 1100, italic: false, underline: false, strikethrough: false });
      let n = 1;
      try { n = w.getCellParagraphCount(ref.sec, ref.ppi, ref.ci, b.cellIdx); } catch { n = 1; }
      for (let p = 0; p < n; p += 1) {
        let len = 0;
        try { len = w.getCellParagraphLength(ref.sec, ref.ppi, ref.ci, b.cellIdx, p); } catch { len = 0; }
        w.applyCharFormatInCell(ref.sec, ref.ppi, ref.ci, b.cellIdx, p, 0, len, JSON.stringify(char));
      }
    }
  });
  try { raw(w).lilySetTableDescription(ref.sec, ref.ppi, ref.ci, descriptionOfStyle(style)); } catch { /* 표지를 못 쓰면 꾸밈만 */ }
  return true;
}

/**
 * 줄을 넣고 빼고 옮긴 뒤(같은 snapshot 안): 표에 스타일 표지가 있으면 다시 꾸민다. 글자 꾸밈은 가장자리 줄(첫 · 둘째 · 끝에서 둘째 · 끝 행과 열)과
 * `extra` 줄에만 — 요약 행 · 마지막 열 · 제목 행이 옮겨 가는 자리. 가운데 칸에 사용자가 준 굵게는 그대로 둔다.
 */
export function restyleAfter(w: WasmBridge, ref: Ref, extra?: { rows?: number[]; cols?: number[] }): void {
  const style = readStyle(w, ref);
  if (!style) return;
  const rows = new Set(extra?.rows ?? []);
  const cols = new Set(extra?.cols ?? []);
  applyStyle(w, ref, style, (b, R, C) => {
    const [r1, c1] = [spanEnd(b.row, b.rowSpan), spanEnd(b.col, b.colSpan)];
    const edgeRow = (r: number) => r <= 1 || r >= R - 2 || rows.has(r);
    const edgeCol = (c: number) => c <= 1 || c >= C - 2 || cols.has(c);
    return edgeRow(b.row) || edgeRow(r1) || edgeCol(b.col) || edgeCol(c1);
  });
}
