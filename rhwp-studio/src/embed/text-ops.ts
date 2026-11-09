/**
 * [lily] 임베드 호스트 글 넣기(text.insert RPC).
 *
 * 문서 에이전트 exact command(document-agent/controller.ts)는 컨트롤이 없는 본문 문단 하나를 통째로 바꾸는 계약이라
 * 구역 첫 문단(구역·단 정의 컨트롤)·새 빈 문서에 글을 쓰거나 새 문단을 만들 수 없다. 호스트(LilyOffice 에이치독스의
 * AI 툴)가 본문 위치에 글을 넣고 줄바꿈(`\n`)마다 문단을 나누도록 한다. snapshot 라우팅(memo.insert 와 같은 길)이라
 * 호출 한 번이 실행 취소 한 단계이고 dirty·자동 저장이 따라온다.
 */
import type { InputHandler } from '../engine/input-handler.ts';

export const MAX_INSERT_TEXT = 20000;

export interface EmbedTextInsertV1 {
  section: number;
  paragraph: number;
  /** 문단 안 글자 오프셋(코어 단위 — getParagraphLength 와 같음) */
  offset: number;
  /** 넣을 글. `\n`(또는 `\r\n`)마다 문단을 나눈다. 그 밖의 제어 문자는 받지 않는다 */
  text: string;
}

/** 글 넣기 결과: 넣은 뒤 캐럿 자리(마지막 문단·오프셋) */
export interface EmbedTextInsertResultV1 {
  ok: boolean;
  section?: number;
  paragraph?: number;
  offset?: number;
  /** 새로 생긴 문단 수(= 줄바꿈 수) */
  paragraphsAdded?: number;
}

function index(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} must be a non-negative safe integer`);
  return value as number;
}

export function parseTextInsert(value: Record<string, unknown>): EmbedTextInsertV1 {
  const text = value.text;
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_INSERT_TEXT) {
    throw new Error(`text must be a non-empty string (max ${MAX_INSERT_TEXT})`);
  }
  const normalized = text.replace(/\r\n?/g, '\n');
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0009\u000b-\u001f\u007f]/u.test(normalized)) {
    throw new Error('text must not contain control characters other than line breaks');
  }
  return {
    section: index(value.section, 'section'),
    paragraph: index(value.paragraph, 'paragraph'),
    offset: index(value.offset, 'offset'),
    text: normalized,
  };
}

/** text.insert 가 쓰는 코어 메서드(WasmBridge 의 일부) */
export interface TextInsertWasm {
  getSectionCount(): number;
  getParagraphCount(section: number): number;
  getParagraphLength(section: number, paragraph: number): number;
  insertText(section: number, paragraph: number, offset: number, text: string): string;
  splitParagraph(section: number, paragraph: number, offset: number): string;
}

const charCount = (s: string) => Array.from(s).length;

/**
 * 줄마다 insertText, 줄 사이마다 splitParagraph(Enter 와 같은 코어 경로 — engine/command.ts SplitParagraphCommand).
 * 좌표가 본문 문단 밖이면 null(아무것도 바꾸지 않는다). 돌려주는 값 = 마지막 글자 뒤 위치.
 */
export function applyTextInsert(
  wasm: TextInsertWasm,
  req: EmbedTextInsertV1,
): { section: number; paragraph: number; offset: number; paragraphsAdded: number } | null {
  const { section } = req;
  if (section >= wasm.getSectionCount() || req.paragraph >= wasm.getParagraphCount(section)) return null;
  if (req.offset > wasm.getParagraphLength(section, req.paragraph)) return null;
  let paragraph = req.paragraph;
  let offset = req.offset;
  const lines = req.text.split('\n');
  lines.forEach((line, i) => {
    if (i > 0) {
      const r = JSON.parse(wasm.splitParagraph(section, paragraph, offset)) as { ok?: boolean; paraIdx?: number };
      if (!r.ok || typeof r.paraIdx !== 'number') throw new Error('splitParagraph failed');
      paragraph = r.paraIdx;
      offset = 0;
    }
    if (line) {
      wasm.insertText(section, paragraph, offset, line);
      offset += charCount(line);
    }
  });
  return { section, paragraph, offset, paragraphsAdded: lines.length - 1 };
}

/** 본문 위치에 글을 넣는다(실행 취소 한 단계). 좌표가 본문 문단 밖이면 ok: false */
export function insertTextAt(ih: InputHandler, req: EmbedTextInsertV1): EmbedTextInsertResultV1 {
  let result: ReturnType<typeof applyTextInsert> = null;
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'insertTextEmbed',
    operation: (wasm) => {
      result = applyTextInsert(wasm, req);
      return result ? { sectionIndex: result.section, paragraphIndex: result.paragraph, charOffset: result.offset } : null;
    },
  });
  const r = result as ReturnType<typeof applyTextInsert>;
  return r ? { ok: true, section: r.section, paragraph: r.paragraph, offset: r.offset, paragraphsAdded: r.paragraphsAdded } : { ok: false };
}
