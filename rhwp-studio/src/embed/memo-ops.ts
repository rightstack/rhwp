/**
 * [lily] 임베드 호스트 메모 넣기·고치기(memo.* RPC).
 *
 * studio 에는 메모 명령이 없어(커맨드 레지스트리) 호스트(LilyOffice 에이치독스)의 메모 패널이 쓸 길을 만든다.
 * 둘 다 snapshot 라우팅(누름틀 삽입 `insert:field` 와 같은 길)이라 실행 취소에 남고 dirty·자동 저장이 따라온다.
 * 메모 본문은 화면에 그려지지 않는다(studio 렌더러에 메모 표시 없음) — 목록은 호스트가 그린다.
 */
import type { InputHandler } from '../engine/input-handler.ts';

export const MAX_MEMO_TEXT = 4000;
export const MAX_MEMO_AUTHOR = 64;

export interface EmbedMemoInsertV1 {
  text: string;
  author: string;
}

export interface EmbedMemoEditV1 {
  memoIndex: number;
  text: string;
}

function memoText(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_MEMO_TEXT) {
    throw new Error(`text must be a non-empty string (max ${MAX_MEMO_TEXT})`);
  }
  return value;
}

export function parseMemoInsert(value: Record<string, unknown>): EmbedMemoInsertV1 {
  const author = value.author ?? '';
  if (typeof author !== 'string' || author.length > MAX_MEMO_AUTHOR) {
    throw new Error(`author must be a string (max ${MAX_MEMO_AUTHOR})`);
  }
  return { text: memoText(value.text), author };
}

export function parseMemoEdit(value: Record<string, unknown>): EmbedMemoEditV1 {
  if (!Number.isSafeInteger(value.memoIndex) || (value.memoIndex as number) < 1) {
    throw new Error('memoIndex must be a positive safe integer');
  }
  return { memoIndex: value.memoIndex as number, text: memoText(value.text) };
}

/** 캐럿(선택이 있으면 그 시작) 위치에 메모를 넣는다. 본문 문단이 아니면 ok: false */
export function insertMemoAtCaret(ih: InputHandler, req: EmbedMemoInsertV1): { ok: boolean; memoIndex?: number } {
  if (!ih.isCaretInBodyText()) return { ok: false };
  const pos = ih.getSelection()?.start ?? ih.getCursorPosition();
  if (pos.parentParaIndex !== undefined) return { ok: false };
  let memoIndex: number | undefined;
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'insertMemo',
    operation: (wasm) => {
      const r = wasm.insertMemo(pos, req.text, req.author);
      if (!r.ok) return null;
      memoIndex = r.memoIndex;
      return { ...pos, charOffset: r.charOffset ?? pos.charOffset };
    },
  });
  ih.focus();
  return memoIndex ? { ok: true, memoIndex } : { ok: false };
}

/** 메모 번호로 글을 바꾼다. 못 찾으면 ok: false */
export function editMemo(ih: InputHandler, req: EmbedMemoEditV1): { ok: boolean } {
  let ok = false;
  const pos = ih.getCursorPosition();
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'editMemo',
    operation: (wasm) => {
      ok = wasm.updateMemoText(req.memoIndex, req.text);
      return ok ? pos : null;
    },
  });
  return { ok };
}
