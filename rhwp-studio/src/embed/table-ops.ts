/**
 * [lily] 임베드 호스트 표 넣기(table.insert RPC).
 *
 * studio 의 표 만들기(`table:create`)는 대화 상자를 거친다 — 호스트(LilyOffice 에이치독스의 AI 도구, 커뮤니티 제작 도구)는
 * 대화 상자를 띄울 수 없어 표가 있는 문서를 만들지 못했다. 캐럿 자리에 표를 만들고 칸의 글까지 한 번에 넣는다.
 * snapshot 라우팅 하나(대화 상자의 표 만들기와 같은 길)라 실행 취소 한 단계이고 dirty·자동 저장이 따라온다.
 * 칸의 글은 줄바꿈 없는 한 문단이다(칸 안 문단 나누기는 하지 않는다).
 *
 * [lily] 칸 꾸밈(2026-11-15): 같은 호출에서 칸 너비 · 줄 높이와 범위별 꾸밈(바탕색 · 테두리 · 세로 맞춤 · 글자 굵기/색/크기 ·
 * 문단 맞춤)을 준다 — 표 › 셀 속성 대화 상자와 글자/문단 모양이 쓰는 것과 같은 wasm 함수(setCellProperties ·
 * applyCharFormatInCell · applyParaFormatInCell)이고, 표 만들기와 한 실행 취소 단계다. 호스트는 대화 상자를 띄울 수 없어
 * 꾸민 표(머리 줄에 색이 있는 표, 양식)를 만들 길이 없었다.
 */
import type { InputHandler } from '../engine/input-handler.ts';
import type { WasmBridge } from '../core/wasm-bridge.ts';

export const MAX_TABLE_ROWS = 60;
export const MAX_TABLE_COLS = 20;
export const MAX_CELL_TEXT = 1000;

export const MAX_CELL_FORMATS = 64;

/** 칸 꾸밈 하나: 줄 · 칸 범위(0부터, 끝 포함, 없으면 전부)에 준다. 뒤의 것이 앞의 것을 덮는다 */
export interface EmbedCellFormatV1 {
  rows?: [number, number];
  cols?: [number, number];
  /** 바탕색 #rrggbb */
  fill?: string;
  /** 네 변 테두리. width = 굵기 번호 0–6(기본 1), type = 선 종류(0 없음 · 1 실선 …, 기본 1) */
  border?: { color: string; width?: number; type?: number };
  vAlign?: 'top' | 'center' | 'bottom';
  bold?: boolean;
  /** 글자색 #rrggbb */
  color?: string;
  /** 글자 크기(pt) */
  sizePt?: number;
  align?: 'left' | 'center' | 'right' | 'justify';
}

export interface EmbedTableInsertV1 {
  rows: number;
  cols: number;
  /** 칸의 글: `cells[행][열]`. 없거나 모자란 칸은 빈 칸 */
  cells?: string[][];
  /** 칸 너비(mm), 칸 차례대로. 모자란 칸은 그대로 */
  widthsMm?: number[];
  /** 줄 높이(mm), 줄 차례대로. 모자란 줄은 그대로 */
  heightsMm?: number[];
  format?: EmbedCellFormatV1[];
}

export interface EmbedTableInsertResultV1 {
  ok: boolean;
  /** 표가 들어간 본문 문단(구역 안 번호) */
  paragraph?: number;
  rows?: number;
  cols?: number;
}

const count = (value: unknown, max: number, name: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > max) {
    throw new Error(`${name} must be an integer from 1 to ${max}`);
  }
  return value as number;
};

const COLOR = /^#[0-9a-fA-F]{6}$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function parseSizes(value: unknown, max: number, name: string): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > max || !value.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 500)) {
    throw new Error(`${name} must be an array of at most ${max} numbers from 1 to 500 (mm)`);
  }
  return value as number[];
}

function parseRange(value: unknown, max: number, name: string): [number, number] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== 2 || !value.every((v) => Number.isSafeInteger(v)) || value[0] < 0 || value[1] < value[0] || value[1] >= max) {
    throw new Error(`${name} must be [from, to] inside the table (0-based, inclusive)`);
  }
  return [value[0] as number, value[1] as number];
}

function parseFormats(value: unknown, rows: number, cols: number): EmbedCellFormatV1[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_CELL_FORMATS) throw new Error(`format must be an array of at most ${MAX_CELL_FORMATS} entries`);
  return value.map((raw, i) => {
    const at = `format[${i}]`;
    if (!isRecord(raw)) throw new Error(`${at} must be an object`);
    for (const k of Object.keys(raw)) {
      if (!['rows', 'cols', 'fill', 'border', 'vAlign', 'bold', 'color', 'sizePt', 'align'].includes(k)) throw new Error(`${at}.${k} is not a known field`);
    }
    const out: EmbedCellFormatV1 = {};
    const r = parseRange(raw.rows, rows, `${at}.rows`);
    const c = parseRange(raw.cols, cols, `${at}.cols`);
    if (r) out.rows = r;
    if (c) out.cols = c;
    for (const k of ['fill', 'color'] as const) {
      if (raw[k] === undefined) continue;
      if (typeof raw[k] !== 'string' || !COLOR.test(raw[k] as string)) throw new Error(`${at}.${k} must be #rrggbb`);
      out[k] = raw[k] as string;
    }
    if (raw.border !== undefined) {
      const b = raw.border;
      if (!isRecord(b) || typeof b.color !== 'string' || !COLOR.test(b.color)) throw new Error(`${at}.border.color must be #rrggbb`);
      for (const k of Object.keys(b)) if (!['color', 'width', 'type'].includes(k)) throw new Error(`${at}.border.${k} is not a known field`);
      for (const [k, max] of [['width', 6], ['type', 16]] as const) {
        if (b[k] !== undefined && (!Number.isSafeInteger(b[k]) || (b[k] as number) < 0 || (b[k] as number) > max)) throw new Error(`${at}.border.${k} must be an integer from 0 to ${max}`);
      }
      out.border = { color: b.color, ...(b.width !== undefined && { width: b.width as number }), ...(b.type !== undefined && { type: b.type as number }) };
    }
    if (raw.vAlign !== undefined) {
      if (!['top', 'center', 'bottom'].includes(raw.vAlign as string)) throw new Error(`${at}.vAlign must be top, center or bottom`);
      out.vAlign = raw.vAlign as EmbedCellFormatV1['vAlign'];
    }
    if (raw.align !== undefined) {
      if (!['left', 'center', 'right', 'justify'].includes(raw.align as string)) throw new Error(`${at}.align must be left, center, right or justify`);
      out.align = raw.align as EmbedCellFormatV1['align'];
    }
    if (raw.bold !== undefined) {
      if (typeof raw.bold !== 'boolean') throw new Error(`${at}.bold must be true or false`);
      out.bold = raw.bold;
    }
    if (raw.sizePt !== undefined) {
      if (typeof raw.sizePt !== 'number' || !Number.isFinite(raw.sizePt) || raw.sizePt < 1 || raw.sizePt > 200) throw new Error(`${at}.sizePt must be a number from 1 to 200`);
      out.sizePt = raw.sizePt;
    }
    return out;
  });
}

export function parseTableInsert(value: Record<string, unknown>): EmbedTableInsertV1 {
  const rows = count(value.rows, MAX_TABLE_ROWS, 'rows');
  const cols = count(value.cols, MAX_TABLE_COLS, 'cols');
  const widthsMm = parseSizes(value.widthsMm, cols, 'widthsMm');
  const heightsMm = parseSizes(value.heightsMm, rows, 'heightsMm');
  const format = parseFormats(value.format, rows, cols);
  const look = { ...(widthsMm && { widthsMm }), ...(heightsMm && { heightsMm }), ...(format && { format }) };
  if (value.cells === undefined) return { rows, cols, ...look };
  if (!Array.isArray(value.cells) || value.cells.length > rows) throw new Error(`cells must be an array of at most ${rows} rows`);
  const cells = value.cells.map((row, r) => {
    if (!Array.isArray(row) || row.length > cols) throw new Error(`cells[${r}] must be an array of at most ${cols} texts`);
    return row.map((text, c) => {
      // 줄바꿈·탭 같은 제어 글자는 받지 않는다(칸의 글은 한 문단)
      if (typeof text !== 'string' || text.length > MAX_CELL_TEXT || /[\u0000-\u001f\u007f]/.test(text)) {
        throw new Error(`cells[${r}][${c}] must be plain text without control characters (max ${MAX_CELL_TEXT})`);
      }
      return text;
    });
  });
  return { rows, cols, cells, ...look };
}

/** mm → HWPUNIT(1/7200 인치) */
const hwpunit = (mm: number) => Math.round((mm * 7200) / 25.4);
const V_ALIGN = { top: 0, center: 1, bottom: 2 } as const;

/** 칸 하나에 줄 꾸밈: 칸 속성(너비 · 높이 · 바탕 · 테두리 · 세로 맞춤)과 글자 · 문단 모양. 범위에 드는 꾸밈을 차례로 겹친다 */
function lookOf(req: EmbedTableInsertV1, row: number, col: number): { props: Record<string, unknown>; char: Record<string, unknown>; align?: string } {
  const props: Record<string, unknown> = {};
  const char: Record<string, unknown> = {};
  let align: string | undefined;
  if (req.widthsMm?.[col] !== undefined) props.width = hwpunit(req.widthsMm[col]!);
  if (req.heightsMm?.[row] !== undefined) props.height = hwpunit(req.heightsMm[row]!);
  for (const f of req.format ?? []) {
    if (f.rows && (row < f.rows[0] || row > f.rows[1])) continue;
    if (f.cols && (col < f.cols[0] || col > f.cols[1])) continue;
    if (f.fill) { props.fillType = 'solid'; props.fillColor = f.fill.toLowerCase(); }
    if (f.border) {
      const line = { type: f.border.type ?? 1, width: f.border.width ?? 1, color: f.border.color.toLowerCase() };
      props.borderLeft = line; props.borderRight = line; props.borderTop = line; props.borderBottom = line;
    }
    if (f.vAlign) props.verticalAlign = V_ALIGN[f.vAlign];
    if (f.bold !== undefined) char.bold = f.bold;
    if (f.color) char.textColor = f.color.toLowerCase();
    if (f.sizePt !== undefined) char.fontSize = Math.round(f.sizePt * 100);
    if (f.align) align = f.align;
  }
  return { props, char, ...(align && { align }) };
}

/** 캐럿(선택이 있으면 그 시작) 자리에 표를 만들고 칸의 글을 넣는다. 본문 문단이 아니면(표 안·머리말 등) ok: false */
export function insertTableAtCaret(ih: InputHandler, req: EmbedTableInsertV1): EmbedTableInsertResultV1 {
  if (!ih.isCaretInBodyText()) return { ok: false };
  const pos = ih.getSelection()?.start ?? ih.getCursorPosition();
  if (pos.parentParaIndex !== undefined) return { ok: false };
  let paragraph: number | undefined;
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'createTable',
    operation: (wasm) => {
      const r = wasm.createTable(pos.sectionIndex, pos.paragraphIndex, pos.charOffset, req.rows, req.cols);
      if (!r.ok) return pos;
      paragraph = r.paraIdx;
      (req.cells ?? []).forEach((row, ri) => row.forEach((text, ci) => {
        if (text) wasm.insertTextInCell(pos.sectionIndex, r.paraIdx, r.controlIdx, ri * req.cols + ci, 0, 0, text);
      }));
      // [lily] 칸 꾸밈: 글을 넣은 뒤에(글자 모양은 들어 있는 글에 준다)
      if (req.widthsMm || req.heightsMm || req.format) {
        for (let ri = 0; ri < req.rows; ri += 1) {
          for (let ci = 0; ci < req.cols; ci += 1) {
            const cell = ri * req.cols + ci;
            const { props, char, align } = lookOf(req, ri, ci);
            if (Object.keys(props).length) wasm.setCellProperties(pos.sectionIndex, r.paraIdx, r.controlIdx, cell, props);
            const len = (req.cells?.[ri]?.[ci] ?? '').length;
            if (len && Object.keys(char).length) wasm.applyCharFormatInCell(pos.sectionIndex, r.paraIdx, r.controlIdx, cell, 0, 0, len, JSON.stringify(char));
            if (align) wasm.applyParaFormatInCell(pos.sectionIndex, r.paraIdx, r.controlIdx, cell, 0, JSON.stringify({ alignment: align }));
          }
        }
      }
      // 캐럿은 표 다음 본문 문단의 처음 — 호스트가 이어서 글을 넣을 자리
      return { sectionIndex: pos.sectionIndex, paragraphIndex: r.paraIdx + 1, charOffset: 0 };
    },
  });
  ih.focus();
  return paragraph === undefined ? { ok: false } : { ok: true, paragraph, rows: req.rows, cols: req.cols };
}

// ── [lily] 칸 바탕색(table.cellFill · table.setCellFill, 2026-11-26) ──
// 호스트 리본(LilyOffice 에이치독스 표 탭)의 "칸 배경" 색 메뉴 — studio 에서는 표 › 셀 테두리/배경 대화 상자의 배경 탭이 하는 일이다.
// 대화 상자와 같은 wasm 함수(setCellProperties 의 fillType · fillColor)를 snapshot 하나로 부른다(실행 취소 한 단계, dirty 가 따라온다).
// 대상 = 셀 블록 선택(F5 · 끌기)이면 그 범위에 걸친 칸, 아니면 캐럿이 있는 칸. 중첩 표(칸 안의 표)는 다루지 않는다(ok: false).

export interface EmbedCellFillV1 {
  /** 바탕색 #rrggbb. null 이면 바탕색을 없앤다 */
  color: string | null;
}

export interface EmbedCellFillStateV1 {
  /** 캐럿이 (맨 바깥) 표 칸 안인가 */
  inTable: boolean;
  /** 캐럿 칸의 바탕색 #rrggbb, 없으면 null */
  color: string | null;
}

const CELL_COLOR = /^#[0-9a-fA-F]{6}$/;

export function parseCellFill(value: Record<string, unknown>): EmbedCellFillV1 {
  if (value.color !== null && (typeof value.color !== 'string' || !CELL_COLOR.test(value.color))) throw new Error('color must be #rrggbb or null');
  return { color: value.color === null ? null : (value.color as string).toLowerCase() };
}

type CellTarget = { sec: number; ppi: number; ci: number; cell: number };

/** 캐럿 칸(맨 바깥 표). 표 밖이거나 중첩 표면 null */
function caretCell(ih: InputHandler): CellTarget | null {
  const pos = ih.getCursorPosition();
  if (pos.parentParaIndex === undefined || pos.controlIndex === undefined || pos.cellIndex === undefined) return null;
  if (pos.cellPath && pos.cellPath.length > 1) return null;
  return { sec: pos.sectionIndex, ppi: pos.parentParaIndex, ci: pos.controlIndex, cell: pos.cellIndex };
}

/** 캐럿 칸의 바탕색(읽기만) */
export function cellFillState(ih: InputHandler, wasm: WasmBridge): EmbedCellFillStateV1 {
  const at = caretCell(ih);
  if (!at) return { inTable: false, color: null };
  try {
    const p = wasm.getCellProperties(at.sec, at.ppi, at.ci, at.cell);
    const color = p.fillType === 'solid' && typeof p.fillColor === 'string' && CELL_COLOR.test(p.fillColor) ? p.fillColor.toLowerCase() : null;
    return { inTable: true, color };
  } catch {
    return { inTable: true, color: null };
  }
}

/** 셀 블록(또는 캐럿 칸)의 바탕색을 바꾼다 — 실행 취소 한 단계 */
export function setCellFill(ih: InputHandler, req: EmbedCellFillV1): { ok: boolean } {
  const at = caretCell(ih);
  if (!at) return { ok: false };
  const range = ih.isInCellSelectionMode() ? ih.getSelectedCellRange() : null;
  let ok = false;
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'cellBorderFill',
    operation: (wasm) => {
      let cells = [at.cell];
      if (range) {
        const hit = wasm.getTableCellBboxes(at.sec, at.ppi, at.ci).filter((b) => {
          const endRow = b.row + Math.max(1, b.rowSpan) - 1;
          const endCol = b.col + Math.max(1, b.colSpan) - 1;
          return b.row <= range.endRow && endRow >= range.startRow && b.col <= range.endCol && endCol >= range.startCol;
        }).map((b) => b.cellIdx);
        if (hit.length) cells = [...new Set(hit)];
      }
      const props = req.color ? { fillType: 'solid', fillColor: req.color } : { fillType: 'none' };
      wasm.runInBatch(() => {
        for (const cell of cells) wasm.setCellProperties(at.sec, at.ppi, at.ci, cell, props);
      });
      ok = true;
      return ih.getCursorPosition();
    },
  });
  return { ok };
}
