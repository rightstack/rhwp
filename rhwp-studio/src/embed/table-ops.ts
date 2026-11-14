/**
 * [lily] 임베드 호스트 표 넣기(table.insert RPC).
 *
 * studio 의 표 만들기(`table:create`)는 대화 상자를 거친다 — 호스트(LilyOffice 에이치독스의 AI 도구, 커뮤니티 제작 도구)는
 * 대화 상자를 띄울 수 없어 표가 있는 문서를 만들지 못했다. 캐럿 자리에 표를 만들고 칸의 글까지 한 번에 넣는다.
 * snapshot 라우팅 하나(대화 상자의 표 만들기와 같은 길)라 실행 취소 한 단계이고 dirty·자동 저장이 따라온다.
 * 칸의 글은 줄바꿈 없는 한 문단이다(칸 안 문단 나누기는 하지 않는다).
 */
import type { InputHandler } from '../engine/input-handler.ts';

export const MAX_TABLE_ROWS = 60;
export const MAX_TABLE_COLS = 20;
export const MAX_CELL_TEXT = 1000;

export interface EmbedTableInsertV1 {
  rows: number;
  cols: number;
  /** 칸의 글: `cells[행][열]`. 없거나 모자란 칸은 빈 칸 */
  cells?: string[][];
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

export function parseTableInsert(value: Record<string, unknown>): EmbedTableInsertV1 {
  const rows = count(value.rows, MAX_TABLE_ROWS, 'rows');
  const cols = count(value.cols, MAX_TABLE_COLS, 'cols');
  if (value.cells === undefined) return { rows, cols };
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
  return { rows, cols, cells };
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
      // 캐럿은 표 다음 본문 문단의 처음 — 호스트가 이어서 글을 넣을 자리
      return { sectionIndex: pos.sectionIndex, paragraphIndex: r.paraIdx + 1, charOffset: 0 };
    },
  });
  ih.focus();
  return paragraph === undefined ? { ok: false } : { ok: true, paragraph, rows: req.rows, cols: req.cols };
}
