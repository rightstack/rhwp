/**
 * [lily] 임베드 호스트 누름틀(field.*) RPC — 넣기 · 목록 · 값 넣기.
 *
 * studio 에서 누름틀은 입력 › 필드 입력(대화 상자, `insert:field`)으로 넣고, 값은 그 자리를 눌러 친다. 호스트(LilyOffice
 * 에이치독스의 AI 도구 · 명령 검색 · 템플릿 제작 도구)는 대화 상자를 쓸 수 없어 채울 자리를 누름틀로 만들거나 채우지 못했다.
 * 대화 상자와 같은 wasm 함수(insertClickHereField — 본문 · 셀 · 중첩 표)와 코어 값 넣기(setFieldValue)를 snapshot 하나로
 * 부른다(실행 취소 한 단계, dirty · 자동 저장이 따라온다). 목록은 누름틀만(셀 구역 이름 같은 가상 필드는 뺀다).
 */
import type { InputHandler } from '../engine/input-handler.ts';
import type { WasmBridge } from '../core/wasm-bridge.ts';
import type { DocumentPosition } from '../core/types.ts';

export const MAX_FIELD_NAME = 64;
export const MAX_FIELD_GUIDE = 256;
export const MAX_FIELD_VALUE = 4000;

export interface EmbedFieldInsertV1 {
  /** 누름틀 이름(채우는 쪽이 찾는 열쇠). 빈 문자열 = 이름 없음 */
  name: string;
  /** 안내문(값이 비었을 때 보이는 글) */
  guide: string;
  /** 누름틀 메모(도움말) */
  memo: string;
  /** 양식 모드에서도 고칠 수 있는가(기본 true) */
  editable: boolean;
}

export interface EmbedFieldSetV1 {
  fieldId?: number;
  name?: string;
  /** 같은 이름이 여럿일 때 몇 번째(0부터, 기본 0) */
  occurrence?: number;
  value: string;
}

export interface EmbedFieldV1 {
  fieldId: number;
  name: string;
  guide: string;
  value: string;
  /** 본문 문단 자리(표 · 글상자 안이면 그 표를 가진 본문 문단) */
  section: number;
  paragraph: number;
  /** 표 칸 · 글상자 안 */
  nested: boolean;
  /** 본문 문단이면 그 문단 안 [start, end) 글자 자리 */
  start: number;
  end: number;
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/u;

function text(value: unknown, key: string, max: number, required = false): string {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || CONTROL.test(value)) {
    throw new Error(`${key} must be a one-line string (max ${max})`);
  }
  return value;
}

export function parseFieldInsert(value: Record<string, unknown>): EmbedFieldInsertV1 {
  if (value.editable !== undefined && typeof value.editable !== 'boolean') throw new Error('editable must be a boolean');
  return {
    name: text(value.name, 'name', MAX_FIELD_NAME).trim(),
    guide: text(value.guide, 'guide', MAX_FIELD_GUIDE),
    memo: text(value.memo, 'memo', MAX_FIELD_GUIDE),
    editable: value.editable !== false,
  };
}

export function parseFieldSet(value: Record<string, unknown>): EmbedFieldSetV1 {
  const hasId = value.fieldId !== undefined;
  const hasName = value.name !== undefined;
  if (hasId === hasName) throw new Error('give exactly one of fieldId or name');
  const out: EmbedFieldSetV1 = { value: text(value.value, 'value', MAX_FIELD_VALUE, true) };
  if (hasId) {
    if (!Number.isSafeInteger(value.fieldId) || (value.fieldId as number) < 0) throw new Error('fieldId must be a non-negative safe integer');
    out.fieldId = value.fieldId as number;
  } else {
    const name = text(value.name, 'name', MAX_FIELD_NAME, true).trim();
    if (!name) throw new Error('name must not be empty');
    out.name = name;
  }
  if (value.occurrence !== undefined) {
    if (hasId) throw new Error('occurrence goes with name');
    if (!Number.isSafeInteger(value.occurrence) || (value.occurrence as number) < 0) throw new Error('occurrence must be a non-negative safe integer');
    out.occurrence = value.occurrence as number;
  }
  return out;
}

type FieldListWasm = Pick<WasmBridge, 'getFieldList'>;

/** 문서의 누름틀(문서 차례) */
export function listClickHereFields(wasm: FieldListWasm): EmbedFieldV1[] {
  return wasm.getFieldList()
    .filter((f) => f.fieldType === 'clickhere' && !f.cellField)
    .map((f) => ({
      fieldId: f.fieldId,
      name: f.name,
      guide: f.guide,
      value: f.value,
      section: f.location.sectionIndex,
      paragraph: f.location.paraIndex,
      nested: (f.location.path?.length ?? 0) > 0,
      start: f.startCharIdx ?? 0,
      end: f.endCharIdx ?? 0,
    }));
}

/** 캐럿(선택이 있으면 그 시작)에 빈 누름틀 — 본문 · 표 칸 · 글상자. 머리말 · 각주 안이면 ok: false */
export function insertFieldAtCaret(ih: InputHandler, wasm: Pick<WasmBridge, 'clearActiveField'>, req: EmbedFieldInsertV1): { ok: boolean; fieldId?: number } {
  // 머리말 · 꼬리말 · 각주 편집 중이면 캐럿 좌표가 본문 좌표가 아니다(studio 도 insert:note-close 에서 cursor 를 같은 식으로 본다)
  const cur = (ih as unknown as { cursor?: { isInHeaderFooter?(): boolean; isInFootnote?(): boolean } }).cursor;
  if (cur?.isInHeaderFooter?.() || cur?.isInFootnote?.()) return { ok: false };
  const pos = ih.getSelection()?.start ?? ih.getCursorPosition();
  let fieldId: number | undefined;
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'insertField',
    operation: (w) => {
      const r = w.insertClickHereField(pos, req.guide, req.memo, req.name, req.editable);
      if (!r.ok) return null;
      fieldId = r.fieldId;
      return { ...pos, charOffset: r.charOffset ?? pos.charOffset };
    },
  });
  // 대화 상자 길(insert:field)과 같다: 캐럿은 누름틀 끝 밖, 활성 누름틀 해제(안내문이 다시 보인다)
  if (fieldId !== undefined) {
    ih.markCurrentFieldEndOutside();
    wasm.clearActiveField();
  }
  ih.focus();
  return fieldId !== undefined ? { ok: true, fieldId } : { ok: false };
}

/** 값을 넣은 뒤 캐럿 자리: 본문 누름틀이면 그 끝, 아니면 지금 자리(셀 안이면 그 칸 문단 처음 — 글 길이가 바뀌었을 수 있다) */
function caretAfterSet(field: EmbedFieldV1 | undefined, cursor: DocumentPosition): DocumentPosition {
  if (field && !field.nested) return { sectionIndex: field.section, paragraphIndex: field.paragraph, charOffset: field.end };
  return cursor.parentParaIndex !== undefined ? { ...cursor, charOffset: 0 } : cursor;
}

/** 누름틀 하나에 값을 넣는다(이름이면 같은 이름 중 occurrence 번째). 못 찾으면 ok: false */
export function setFieldValue(ih: InputHandler, req: EmbedFieldSetV1): { ok: boolean; fieldId?: number } {
  const cursor = ih.getCursorPosition();
  let fieldId: number | undefined;
  ih.executeOperation({
    kind: 'snapshot',
    operationType: 'setFieldValue',
    operation: (wasm) => {
      const fields = listClickHereFields(wasm);
      const target = req.fieldId !== undefined
        ? fields.find((f) => f.fieldId === req.fieldId)
        : fields.filter((f) => f.name === req.name)[req.occurrence ?? 0];
      if (!target) return null;
      try {
        if (!wasm.setFieldValue(target.fieldId, req.value).ok) return null;
      } catch {
        return null; // 코어가 못 찾은 자리(가상 필드 등) — 기록하지 않는다
      }
      fieldId = target.fieldId;
      return caretAfterSet(listClickHereFields(wasm).find((f) => f.fieldId === target.fieldId), cursor);
    },
  });
  return fieldId !== undefined ? { ok: true, fieldId } : { ok: false };
}
