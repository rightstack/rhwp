/**
 * [lily] 마크다운 입력 규칙(임베드 호스트가 `markdown.setRules` 로 켤 때만 — upstream 기본 동작은 그대로).
 *
 * LilyOffice 에이치독스(2026-11-10 M10)가 요청한 세 규칙이다. 조합(IME) 중에는 판단하지 않는다 — 공백은
 * `onInput` 의 비조합 분기에서만, Enter 는 본문 `case 'Enter'` 에서만 부른다(조합 중 Enter 는 확정만 한다).
 * - 문단 맨 앞 `# `~`### ` 뒤 공백 → 개요 1~3 스타일(접두어 삭제)
 * - `**글자**` 뒤 공백 → 굵게(별표 넷 삭제)
 * - 문단 전체가 ```` ```언어 ```` 일 때 Enter → 코드 블록('코드' 스타일 + 언어 책갈피). 빈 마지막 코드 줄에서 Enter → 바탕글로 빠져나오기
 * 변환은 snapshot 하나(= 실행 취소 한 단계). 변환 직후 Esc(또는 Ctrl/Cmd+Z 한 번)는 변환만 되돌려 원문이 남는다.
 */
import type { DocumentPosition } from '../core/types.ts';
import type { WasmBridge } from '../core/wasm-bridge.ts';
import type { InputHandler } from '../engine/input-handler.ts';
import {
  applyCodeStyle, clearCodeLanguage, codeStyleId, findOutlineStyleId, sanitizeLanguage, setBlockLanguage, type CodeWasm,
} from './code-blocks.ts';

export const MARKDOWN_OPERATION = 'lilyMarkdown';

const cc = (s: string) => Array.from(s).length;

export type SpaceRule =
  | { kind: 'heading'; level: 1 | 2 | 3 }
  /** start = 여는 `**` 의 글자 오프셋, inner = 안쪽 글자 수(코어 단위 = 유니코드 scalar) */
  | { kind: 'bold'; start: number; inner: number };

/** 캐럿 앞 글(방금 친 공백 포함)로 공백 규칙을 고른다 */
export function detectSpaceRule(before: string): SpaceRule | null {
  if (!before.endsWith(' ')) return null;
  const heading = /^(#{1,3}) $/.exec(before);
  if (heading) return { kind: 'heading', level: heading[1].length as 1 | 2 | 3 };
  const body = before.slice(0, -1);
  const bold = /\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/.exec(body);
  if (!bold) return null;
  // `***x**` 처럼 별표가 더 붙어 있으면 굵게로 보지 않는다
  if (bold.index > 0 && body[bold.index - 1] === '*') return null;
  return { kind: 'bold', start: cc(body.slice(0, bold.index)), inner: cc(bold[1]) };
}

/** 문단 전체 글이 코드 펜스(```` ```언어 ````)면 언어(없으면 plain), 아니면 null */
export function detectFence(text: string): string | null {
  const m = /^```([^`\s]*)\s*$/.exec(text);
  return m ? sanitizeLanguage(m[1]) : null;
}

export interface MarkdownRulesHost {
  isCaretInBodyText(): boolean;
  getSelection(): { start: DocumentPosition; end: DocumentPosition } | null;
  getCursorPosition(): DocumentPosition;
  executeOperation: InputHandler['executeOperation'];
  peekUndoCommand(): unknown;
  performUndo(): void;
  isFormMode?(): boolean;
}

/** InputHandler 에 붙는 규칙 묶음(`ih.lilyMarkdown`). 없으면(null) 아무것도 하지 않는다 */
export class MarkdownRules {
  /** 마지막 변환(실행 취소 꼭대기 명령과 변환 뒤 캐럿) — Esc 되돌리기는 이것이 그대로일 때만 */
  private last: { cmd: unknown; pos: DocumentPosition } | null = null;

  private readonly ih: MarkdownRulesHost;
  private readonly wasm: WasmBridge;

  constructor(ih: MarkdownRulesHost, wasm: WasmBridge) {
    this.ih = ih;
    this.wasm = wasm;
  }

  private get w(): CodeWasm { return this.wasm as unknown as CodeWasm; }

  private caret(): DocumentPosition | null {
    if (this.ih.isFormMode?.() || !this.ih.isCaretInBodyText()) return null;
    const sel = this.ih.getSelection();
    if (sel && !samePos(sel.start, sel.end)) return null;
    const pos = this.ih.getCursorPosition();
    return pos.parentParaIndex === undefined ? pos : null;
  }

  private run(operation: (wasm: WasmBridge) => DocumentPosition | null): void {
    this.ih.executeOperation({ kind: 'snapshot', operationType: MARKDOWN_OPERATION, operation });
    this.last = { cmd: this.ih.peekUndoCommand(), pos: this.ih.getCursorPosition() };
  }

  /** 비조합 공백 입력 직후 */
  afterSpace(): void {
    const pos = this.caret();
    if (!pos) return;
    const { sectionIndex: sec, paragraphIndex: para, charOffset: off } = pos;
    let before: string;
    try { before = this.w.getTextRange(sec, para, 0, off); } catch { return; }
    const rule = detectSpaceRule(before);
    if (!rule) return;
    if (rule.kind === 'heading') {
      const styleId = findOutlineStyleId(this.w, rule.level);
      if (styleId < 0) return;
      this.run((wasm) => {
        const w = wasm as unknown as CodeWasm;
        w.deleteText(sec, para, 0, rule.level + 1);
        w.applyStyle(sec, para, styleId);
        return { sectionIndex: sec, paragraphIndex: para, charOffset: 0 };
      });
      return;
    }
    this.run((wasm) => {
      const w = wasm as unknown as CodeWasm;
      w.deleteText(sec, para, rule.start + 2 + rule.inner, 2);
      w.deleteText(sec, para, rule.start, 2);
      w.applyCharFormat(sec, para, rule.start, rule.start + rule.inner, JSON.stringify({ bold: true }));
      return { sectionIndex: sec, paragraphIndex: para, charOffset: off - 4 };
    });
  }

  /** 본문 Enter(Shift 없음) 직전. true 면 문단 나누기를 하지 않는다 */
  beforeEnter(): boolean {
    const pos = this.caret();
    if (!pos) return false;
    const { sectionIndex: sec, paragraphIndex: para, charOffset: off } = pos;
    const w = this.w;
    const len = w.getParagraphLength(sec, para);
    if (off !== len) return false;
    const text = len > 0 ? w.getTextRange(sec, para, 0, len) : '';
    const lang = detectFence(text);
    if (lang !== null) {
      this.run((wasm) => {
        const cw = wasm as unknown as CodeWasm;
        cw.deleteText(sec, para, 0, len);
        applyCodeStyle(cw, sec, para);
        setBlockLanguage(cw, sec, para, lang);
        return { sectionIndex: sec, paragraphIndex: para, charOffset: 0 };
      });
      return true;
    }
    // 빈 마지막 코드 줄 → 바탕글로 빠져나오기
    const codeId = codeStyleId(w);
    if (codeId < 0 || len !== 0 || w.getStyleAt(sec, para).id !== codeId) return false;
    const next = para + 1 < w.getParagraphCount(sec) ? w.getStyleAt(sec, para + 1).id : -1;
    if (next === codeId) return false;
    this.run((wasm) => {
      const cw = wasm as unknown as CodeWasm;
      clearCodeLanguage(cw, sec, para, para);
      cw.applyStyle(sec, para, 0);
      return { sectionIndex: sec, paragraphIndex: para, charOffset: 0 };
    });
    return true;
  }

  /** 본문 Esc. 직전 동작이 규칙 변환이고 캐럿이 그대로면 변환만 되돌린다 */
  revertLast(): boolean {
    const last = this.last;
    this.last = null;
    if (!last || this.ih.peekUndoCommand() !== last.cmd) return false;
    if (!samePos(this.ih.getCursorPosition(), last.pos)) return false;
    this.ih.performUndo();
    return true;
  }
}

function samePos(a: DocumentPosition, b: DocumentPosition): boolean {
  return a.sectionIndex === b.sectionIndex && a.paragraphIndex === b.paragraphIndex && a.charOffset === b.charOffset
    && a.parentParaIndex === b.parentParaIndex && a.cellIndex === b.cellIndex && a.cellParaIndex === b.cellParaIndex;
}

export function parseMarkdownRules(value: Record<string, unknown>): { enabled: boolean } {
  if (typeof value.enabled !== 'boolean') throw new Error('enabled must be a boolean');
  return { enabled: value.enabled };
}
